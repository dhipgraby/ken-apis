import { SetMetadata } from '@nestjs/common';

// System-wide admin role check
export const ADMIN_KEY = 'isAdmin';
export const RequireAdmin = () => SetMetadata(ADMIN_KEY, true);

// Organization role requirements
export const ORG_ROLES_KEY = 'orgRoles';
export type OrgRole = 'OWNER' | 'MEMBER';
export const RequireOrgRole = (...roles: OrgRole[]) => SetMetadata(ORG_ROLES_KEY, roles);

// Combined: System admin OR organization owner
export const ADMIN_OR_OWNER_KEY = 'adminOrOwner';
export const RequireAdminOrOwner = () => SetMetadata(ADMIN_OR_OWNER_KEY, true);
