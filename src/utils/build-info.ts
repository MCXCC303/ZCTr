/**
 * Build-time information injected by zotero-plugin.config.ts (esbuild define).
 *
 * Used for translation-cache isolation: each build writes into its own cache
 * subdirectory, so a development build never pollutes the released addon's
 * cache, and rolling back to a published xpi keeps its previous cache intact.
 */

/** Addon version (from package.json at build time). */
export const BUILD_VERSION: string = __zctr_build_version__;
/** Short git commit hash; "" for tagged releases (or when not a git checkout). */
export const BUILD_GIT_HASH: string = __zctr_git_hash__;
/** True when built from an exact tagged release commit. */
export const BUILD_IS_RELEASE: boolean = __zctr_is_release__;

/**
 * Cache subdirectory name, isolating caches per build:
 * - release: `cache-v<version>`           (e.g. cache-v0.1.2)
 * - dev:     `cache-v<version>+g<commit>` (e.g. cache-v0.1.2+g6a4f288)
 */
export function getCacheSubdirName(): string {
	const base = `cache-v${BUILD_VERSION}`;
	if (!BUILD_IS_RELEASE && BUILD_GIT_HASH) {
		return `${base}+g${BUILD_GIT_HASH}`;
	}
	return base;
}
