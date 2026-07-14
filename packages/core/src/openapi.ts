import type { RouteDefinition, RouteSchema, RouteMeta, HttpMethod } from './types.js';
import { z } from 'zod';
import { zodToJsonSchema } from './json-schema.js';

// ============================================
// OPENAPI TYPES
// ============================================

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPIConfig {
  info: OpenAPIInfo;
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPISpec {
  openapi: '3.1.0';
  info: OpenAPIInfo;
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
}

interface PathItem {
  [method: string]: OperationObject;
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
}

interface ParameterObject {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema: SchemaObject;
  description?: string;
}

interface RequestBodyObject {
  required?: boolean;
  content: {
    'application/json': {
      schema: SchemaObject;
    };
  };
}

interface ResponseObject {
  description: string;
  content?: {
    'application/json': {
      schema: SchemaObject;
    };
  };
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  default?: unknown;
  nullable?: boolean;
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
  additionalProperties?: SchemaObject | boolean;
  $ref?: string;
}

interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
}

// ============================================
// OPENAPI GENERATOR
// ============================================

export class OpenAPIGenerator {
  private config: OpenAPIConfig;
  private schemas: Map<string, SchemaObject> = new Map();
  private schemaCounter = 0;

  constructor(config: OpenAPIConfig) {
    this.config = config;
  }

  /**
   * Generate OpenAPI spec from routes
   */
  generate(routes: RouteDefinition[]): OpenAPISpec {
    const paths: Record<string, PathItem> = {};

    for (const route of routes) {
      const openApiPath = this.honoPathToOpenApi(route.path);
      
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      paths[openApiPath][route.method] = this.routeToOperation(route);
    }

    return {
      openapi: '3.1.0',
      info: this.config.info,
      servers: this.config.servers,
      tags: this.config.tags,
      paths,
      components: {
        schemas: Object.fromEntries(this.schemas),
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: this.config.security
    };
  }

  /**
   * Convert Hono path params to OpenAPI format
   * :id -> {id}
   */
  private honoPathToOpenApi(path: string): string {
    return path.replace(/:([^/]+)/g, '{$1}');
  }

  /**
   * Convert route to OpenAPI operation
   */
  private routeToOperation(route: RouteDefinition): OperationObject {
    const { path, method, module } = route;
    const { schema, meta } = module;

    const operation: OperationObject = {
      operationId: this.generateOperationId(path, method),
      summary: meta?.summary || `${method.toUpperCase()} ${path}`,
      description: meta?.description,
      tags: meta?.tags || [this.extractTag(path)],
      parameters: [],
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },
        '400': {
          description: 'Validation error'
        },
        '500': {
          description: 'Internal server error'
        }
      }
    };

    // Add path parameters
    const pathParams = path.match(/:([^/]+)/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1); // Remove :
        operation.parameters!.push({
          name: paramName,
          in: 'path',
          required: true,
          schema: { type: 'string' }
        });
      }
    }

    // Add query parameters from schema
    if (schema?.query) {
      const querySchema = zodToJsonSchema(schema.query as z.ZodType) as SchemaObject;
      if (querySchema.properties) {
        for (const [name, propSchema] of Object.entries(querySchema.properties)) {
          operation.parameters!.push({
            name,
            in: 'query',
            required: querySchema.required?.includes(name) || false,
            schema: propSchema as SchemaObject
          });
        }
      }
    }

    // Add params schema override
    if (schema?.params) {
      const paramsSchema = zodToJsonSchema(schema.params as z.ZodType) as SchemaObject;
      if (paramsSchema.properties) {
        for (const [name, propSchema] of Object.entries(paramsSchema.properties)) {
          // Find and update existing param
          const existingIdx = operation.parameters!.findIndex(
            p => p.name === name && p.in === 'path'
          );
          if (existingIdx >= 0) {
            operation.parameters![existingIdx].schema = propSchema as SchemaObject;
          }
        }
      }
    }

    // Add request body for POST/PUT/PATCH
    if (['post', 'put', 'patch'].includes(method) && schema?.body) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: zodToJsonSchema(schema.body as z.ZodType) as SchemaObject
          }
        }
      };
    }

    // Add response schemas
    if (schema?.response) {
      for (const [status, responseSchema] of Object.entries(schema.response)) {
        operation.responses[status] = {
          description: this.getStatusDescription(parseInt(status)),
          content: {
            'application/json': {
              schema: zodToJsonSchema(responseSchema as z.ZodType) as SchemaObject
            }
          }
        };
      }
    }

    // Add auth requirement
    if (meta?.auth) {
      operation.security = [{ bearerAuth: [] }];
    }

    return operation;
  }

  /**
   * Generate operation ID from path and method
   */
  private generateOperationId(path: string, method: HttpMethod): string {
    const parts = path
      .split('/')
      .filter(Boolean)
      .map(part => {
        if (part.startsWith(':')) {
          return 'By' + this.capitalize(part.slice(1));
        }
        return this.capitalize(part);
      });

    return method + parts.join('');
  }

  /**
   * Extract tag from path (first segment)
   */
  private extractTag(path: string): string {
    const firstSegment = path.split('/').filter(Boolean)[0];
    return firstSegment ? this.capitalize(firstSegment) : 'Default';
  }

  /**
   * Get HTTP status description
   */
  private getStatusDescription(status: number): string {
    const descriptions: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    return descriptions[status] || 'Response';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ============================================
// SWAGGER UI HTML
// ============================================

export function generateSwaggerHtml(specUrl: string, title: string = 'API Documentation'): string {
  // Sanitize inputs to prevent XSS injection in generated HTML
  const safeSpecUrl = specUrl.replace(/[&'"<>]/g, (c) =>
    ({ '&': '&amp;', "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]!)
  );
  const safeTitle = title.replace(/[&'"<>]/g, (c) =>
    ({ '&': '&amp;', "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]!)
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '${safeSpecUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        persistAuthorization: true
      });
    };
  </script>
</body>
</html>`;
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createOpenAPIGenerator(config: OpenAPIConfig): OpenAPIGenerator {
  return new OpenAPIGenerator(config);
}
