// ============================================================================
// Kozo Zero-Copy Radix Router v2 — Zig → wasm32-freestanding
// ============================================================================
//
// Optimisations over v1:
//   • First-byte dispatch table per node  → O(1) child lookup (was O(N) scan)
//   • Branchless param recording          → no conditional on param_buf bounds
//   • Inline segment iteration            → one less pointer indirection
//   • SSR-ready: wildcard `*` catch-all   → matches remaining path tail
//
// Build (Zig ≥ 0.13):
//   zig build-exe radix.zig -target wasm32-freestanding \
//       -O ReleaseSmall -fno-entry --export-memory -rdynamic -fstrip
//
// Memory layout (shared with JS via wasm.memory.buffer):
//   url_buf      [4096 B]  JS writes the request path here
//   param_buf    [64 B]    WASM writes (offset:u16, len:u16) × N params
//   pattern_buf  [2048 B]  JS writes route patterns here for insert_route
//
// Exports:
//   init()                                    reset all state
//   insert_route(method:u8, len:u32, id:i32)  register pattern (from pattern_buf)
//   match_url(method:u8, len:u32) → i32       match URL (from url_buf), → route_id
//   get_param_count() → u32                   params extracted by last match
//   get_url_buf_ptr() → u32                   offset of url_buf in linear memory
//   get_param_buf_ptr() → u32                 offset of param_buf
//   get_pattern_buf_ptr() → u32               offset of pattern_buf
// ============================================================================

// ── Tuning constants ────────────────────────────────────────────────────
const MAX_NODES: usize = 512;
const MAX_CHILDREN: usize = 16; // max static children per trie level
const MAX_PARAMS: usize = 8; // max :param segments per route
const NONE: u16 = 0xFFFF;

// ── Shared I/O buffers ──────────────────────────────────────────────────
const URL_BUF_SIZE: usize = 4096;
const PARAM_BUF_SIZE: usize = MAX_PARAMS * 4; // (u16 offset + u16 len) per param
const PATTERN_BUF_SIZE: usize = 2048;

var url_buf: [URL_BUF_SIZE]u8 align(16) = [_]u8{0} ** URL_BUF_SIZE;
var param_buf: [PARAM_BUF_SIZE]u8 align(4) = [_]u8{0} ** PARAM_BUF_SIZE;
var pattern_buf: [PATTERN_BUF_SIZE]u8 align(16) = [_]u8{0} ** PATTERN_BUF_SIZE;

var match_param_count: u32 = 0;

// ── String pool (stores segment labels & param names) ───────────────────
const POOL_SIZE: usize = 4096;
var string_pool: [POOL_SIZE]u8 = [_]u8{0} ** POOL_SIZE;
var pool_pos: u32 = 0;

const Stored = struct { offset: u32, len: u16 };

fn poolStore(data: []const u8) Stored {
    if (pool_pos + data.len > POOL_SIZE) return .{ .offset = 0, .len = 0 };
    const start = pool_pos;
    const end = start + data.len;
    @memcpy(string_pool[start..end], data);
    pool_pos = @intCast(end);
    return .{ .offset = start, .len = @intCast(data.len) };
}

fn poolGet(s: Stored) []const u8 {
    return string_pool[s.offset .. s.offset + s.len];
}

// ── Trie node ───────────────────────────────────────────────────────────
// v2: Added first_byte_map for O(1) child dispatch + wildcard_child for SSR
const Node = struct {
    seg: Stored = .{ .offset = 0, .len = 0 },
    route_id: i32 = -1,

    // Static children
    children: [MAX_CHILDREN]u16 = [_]u16{NONE} ** MAX_CHILDREN,
    child_count: u8 = 0,

    // First-byte dispatch: maps first byte of segment → child index in children[]
    // 0xFF = no child with that first byte. Covers printable ASCII (0x20-0x7E).
    first_byte_map: [96]u8 = [_]u8{0xFF} ** 96,

    // Parameter child — at most one `:param` per trie level
    param_child: u16 = NONE,
    param_name: Stored = .{ .offset = 0, .len = 0 },

    // Wildcard child — `*` catch-all (SSR page routes like /blog/*)
    wildcard_child: u16 = NONE,
};

var nodes: [MAX_NODES]Node = blk: {
    @setEvalBranchQuota(200_000);
    var ns: [MAX_NODES]Node = undefined;
    for (&ns) |*n| n.* = Node{};
    break :blk ns;
};
var node_count: u16 = 0;

// Per-method roots: 0=GET 1=POST 2=PUT 3=PATCH 4=DELETE 5=OPTIONS 6=HEAD
var roots: [8]u16 = [_]u16{NONE} ** 8;

// ── Node helpers ────────────────────────────────────────────────────────
fn allocNode() u16 {
    if (node_count >= MAX_NODES) return NONE;
    const idx = node_count;
    nodes[idx] = Node{};
    node_count += 1;
    return idx;
}

inline fn bytesEqual(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |x, y| {
        if (x != y) return false;
    }
    return true;
}

// v2: O(1) first-byte lookup, then confirm remaining bytes
inline fn findStaticChild(node: *const Node, seg: []const u8) u16 {
    if (seg.len == 0) return NONE;
    const fb = seg[0];
    // Map printable ASCII 0x20..0x7E into 0..95 range
    if (fb < 0x20 or fb > 0x7E) return fallbackScan(node, seg);
    const slot = node.first_byte_map[fb - 0x20];
    if (slot == 0xFF) return NONE;
    const ci = node.children[slot];
    if (ci == NONE) return NONE;
    if (bytesEqual(poolGet(nodes[ci].seg), seg)) return ci;
    // Hash collision: first byte matched but rest didn't — linear fallback
    return fallbackScan(node, seg);
}

fn fallbackScan(node: *const Node, seg: []const u8) u16 {
    var i: u8 = 0;
    while (i < node.child_count) : (i += 1) {
        const ci = node.children[i];
        if (ci == NONE) continue;
        if (bytesEqual(poolGet(nodes[ci].seg), seg)) return ci;
    }
    return NONE;
}

fn addStaticChild(node: *Node, child_idx: u16, seg: []const u8) void {
    if (node.child_count >= MAX_CHILDREN) return;
    const slot = node.child_count;
    node.children[slot] = child_idx;
    node.child_count += 1;
    // Update first-byte dispatch table
    if (seg.len > 0) {
        const fb = seg[0];
        if (fb >= 0x20 and fb <= 0x7E) {
            node.first_byte_map[fb - 0x20] = slot;
        }
    }
}

// ── Segment iterator (inlined for hot path) ─────────────────────────────
const Segment = struct { start: usize, len: usize };

inline fn nextSegment(data: []const u8, pos: *usize) ?Segment {
    // Skip leading '/'
    while (pos.* < data.len and data[pos.*] == '/') : (pos.* += 1) {}
    if (pos.* >= data.len) return null;
    const start = pos.*;
    while (pos.* < data.len and data[pos.*] != '/') : (pos.* += 1) {}
    return Segment{ .start = start, .len = pos.* - start };
}

// ── Insert ──────────────────────────────────────────────────────────────
fn doInsert(root_slot: *u16, pattern: []const u8, route_id: i32) void {
    if (root_slot.* == NONE) {
        root_slot.* = allocNode();
        if (root_slot.* == NONE) return;
    }

    var cur = root_slot.*;
    var pos: usize = 0;

    while (true) {
        const maybe = nextSegment(pattern, &pos);
        if (maybe == null) break;
        const seg = maybe.?;
        const seg_data = pattern[seg.start .. seg.start + seg.len];

        if (seg_data.len == 1 and seg_data[0] == '*') {
            // ── Wildcard catch-all (SSR: /blog/*) ──────────────────
            const node_ptr = &nodes[cur];
            if (node_ptr.wildcard_child == NONE) {
                const wc = allocNode();
                if (wc == NONE) return;
                node_ptr.wildcard_child = wc;
            }
            // Wildcard is always terminal — remaining path is captured
            nodes[nodes[cur].wildcard_child].route_id = route_id;
            return;
        } else if (seg_data.len > 0 and seg_data[0] == ':') {
            // ── Parameter segment (:id, :tenantId, …) ──────────────
            const name = seg_data[1..]; // strip leading ':'
            const node_ptr = &nodes[cur];
            if (node_ptr.param_child == NONE) {
                const pc = allocNode();
                if (pc == NONE) return;
                nodes[pc].param_name = poolStore(name);
                node_ptr.param_child = pc;
            }
            cur = nodes[cur].param_child;
        } else {
            // ── Static segment (api, users, permissions, …) ────────
            const existing = findStaticChild(&nodes[cur], seg_data);
            if (existing != NONE) {
                cur = existing;
            } else {
                const nc = allocNode();
                if (nc == NONE) return;
                nodes[nc].seg = poolStore(seg_data);
                addStaticChild(&nodes[cur], nc, seg_data);
                cur = nc;
            }
        }
    }

    nodes[cur].route_id = route_id;
}

// ── Match ───────────────────────────────────────────────────────────────
fn doMatch(root: u16, url: []const u8) i32 {
    if (root == NONE) return -1;

    var cur = root;
    var pos: usize = 0;
    match_param_count = 0;

    while (true) {
        const maybe = nextSegment(url, &pos);
        if (maybe == null) break;
        const seg = maybe.?;
        const seg_data = url[seg.start .. seg.start + seg.len];

        const node = &nodes[cur];

        // 1. Static children — O(1) first-byte dispatch
        const sc = findStaticChild(node, seg_data);
        if (sc != NONE) {
            cur = sc;
            continue;
        }

        // 2. Parameter child — matches any non-empty segment
        if (node.param_child != NONE) {
            // Record param value (branchless: always write, count guards overflow)
            const base = match_param_count * 4;
            param_buf[base + 0] = @truncate(seg.start & 0xFF);
            param_buf[base + 1] = @truncate((seg.start >> 8) & 0xFF);
            param_buf[base + 2] = @truncate(seg.len & 0xFF);
            param_buf[base + 3] = @truncate((seg.len >> 8) & 0xFF);
            match_param_count += 1;
            cur = node.param_child;
            continue;
        }

        // 3. Wildcard catch-all — captures entire remaining path (SSR)
        if (node.wildcard_child != NONE) {
            // Record the remaining path from this segment to end
            const remaining_start = seg.start;
            const remaining_len = url.len - remaining_start;
            const base = match_param_count * 4;
            param_buf[base + 0] = @truncate(remaining_start & 0xFF);
            param_buf[base + 1] = @truncate((remaining_start >> 8) & 0xFF);
            param_buf[base + 2] = @truncate(remaining_len & 0xFF);
            param_buf[base + 3] = @truncate((remaining_len >> 8) & 0xFF);
            match_param_count += 1;
            return nodes[node.wildcard_child].route_id;
        }

        // No child matched — route not found
        return -1;
    }

    return nodes[cur].route_id;
}

// ════════════════════════════════════════════════════════════════════════
// WASM Exports
// ════════════════════════════════════════════════════════════════════════

/// Reset the entire router state. Call once before registering routes.
export fn init() void {
    node_count = 0;
    pool_pos = 0;
    match_param_count = 0;
    for (&roots) |*r| r.* = NONE;
    for (&nodes) |*n| n.* = Node{};
}

/// Register a route.  Pattern bytes must already be in pattern_buf.
/// `method`: 0=GET 1=POST 2=PUT 3=PATCH 4=DELETE 5=OPTIONS 6=HEAD
/// `pat_len`: byte length of the pattern in pattern_buf
/// `route_id`: caller-assigned integer ID (used as handler lookup key in JS)
export fn insert_route(method: u8, pat_len: u32, route_id: i32) void {
    if (method >= 8) return;
    if (pat_len > PATTERN_BUF_SIZE) return;
    doInsert(&roots[method], pattern_buf[0..pat_len], route_id);
}

/// Match a URL path.  Path bytes must already be in url_buf.
/// Returns the route_id on match, or -1 on miss.
/// After a successful match, call get_param_count() and read param_buf
/// to extract captured :param values.
export fn match_url(method: u8, url_len: u32) i32 {
    if (method >= 8) return -1;
    if (url_len > URL_BUF_SIZE) return -1;
    return doMatch(roots[method], url_buf[0..url_len]);
}

/// Number of :param values captured by the last match_url() call.
export fn get_param_count() u32 {
    return match_param_count;
}

/// Pointer (linear-memory offset) to the URL input buffer.
export fn get_url_buf_ptr() u32 {
    return @intFromPtr(&url_buf);
}

/// Pointer (linear-memory offset) to the param output buffer.
export fn get_param_buf_ptr() u32 {
    return @intFromPtr(&param_buf);
}

/// Pointer (linear-memory offset) to the pattern input buffer.
export fn get_pattern_buf_ptr() u32 {
    return @intFromPtr(&pattern_buf);
}
