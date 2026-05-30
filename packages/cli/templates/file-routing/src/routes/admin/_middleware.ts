import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

/** Admin-only — runs after JWT (registerAuthBeforeLoadRoutes order). */
export default canActivate(isAuthenticated, hasRole('admin'));
