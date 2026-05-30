import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPubSub } from '../../src/pubsub.js';

describe('createPubSub', () => {
  let mockPublishRedis: any;
  let mockSubscriber: any;
  let createSubscriber: () => any;
  let pubsub: ReturnType<typeof createPubSub>;

  beforeEach(() => {
    mockPublishRedis = {
      publish: vi.fn().mockResolvedValue(1),
    };
    mockSubscriber = {
      on: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    createSubscriber = vi.fn().mockReturnValue(mockSubscriber);
    pubsub = createPubSub(mockPublishRedis, createSubscriber);
  });

  // ── publish ────────────────────────────────────────────────────────────────

  it('publish() sends JSON to channel', async () => {
    const count = await pubsub.publish('chat', { msg: 'hello' });
    expect(count).toBe(1);
    expect(mockPublishRedis.publish).toHaveBeenCalledWith('chat', '{"msg":"hello"}');
  });

  // ── subscribe ──────────────────────────────────────────────────────────────

  it('subscribe() creates subscriber on first call', () => {
    pubsub.subscribe('events', vi.fn());
    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('events');
  });

  it('subscribe() reuses subscriber for second channel', () => {
    pubsub.subscribe('ch1', vi.fn());
    pubsub.subscribe('ch2', vi.fn());
    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('ch1');
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('ch2');
  });

  it('subscribe() does not resubscribe for second handler on same channel', () => {
    pubsub.subscribe('ch1', vi.fn());
    pubsub.subscribe('ch1', vi.fn());
    expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(1);
  });

  it('message dispatched to correct handler', () => {
    const handler = vi.fn();
    pubsub.subscribe('chat', handler);

    // Simulate ioredis message event
    const onMessage = mockSubscriber.on.mock.calls.find(
      ([event]: [string]) => event === 'message',
    )?.[1];
    expect(onMessage).toBeDefined();

    onMessage('chat', '{"msg":"hi"}');
    expect(handler).toHaveBeenCalledWith({ msg: 'hi' }, 'chat');
  });

  it('message not dispatched to unrelated channel', () => {
    const handler = vi.fn();
    pubsub.subscribe('chat', handler);

    const onMessage = mockSubscriber.on.mock.calls.find(
      ([event]: [string]) => event === 'message',
    )?.[1];

    onMessage('other', '{"x":1}');
    expect(handler).not.toHaveBeenCalled();
  });

  // ── unsubscribe ────────────────────────────────────────────────────────────

  it('unsubscribe() removes handler, unsubscribes when last', () => {
    const unsub = pubsub.subscribe('ch', vi.fn());
    unsub();
    expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('ch');
  });

  it('unsubscribe() does not unsubscribe if other handlers remain', () => {
    const unsub1 = pubsub.subscribe('ch', vi.fn());
    pubsub.subscribe('ch', vi.fn());
    unsub1();
    expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();
  });
});
