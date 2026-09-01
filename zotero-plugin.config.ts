import {execSync} from "node:child_process";
import {defineConfig} from "zotero-plugin-scaffold";
import pkg from "./package.json";

/**
 * Git build info for translation-cache isolation (see src/utils/build-info.ts):
 * - HEAD is an exact tag -> release build, cache dir `cache-v<version>`
 * - untagged HEAD        -> dev build,     cache dir `cache-v<version>+g<hash>`
 */
function detectGitBuild(): {hash: string; isRelease: boolean} {
	try {
		const hash = execSync("git rev-parse --short HEAD", {encoding: "utf8"}).trim();
		let isRelease = false;
		try {
			execSync("git describe --exact-match --tags HEAD", {
				encoding: "utf8",
				stdio: "pipe",
			});
			isRelease = true;
		} catch {
			// Untagged commit: development build.
		}
		return {hash, isRelease};
	} catch {
		// Not a git checkout; fall back to the release-style cache folder.
		return {hash: "", isRelease: true};
	}
}

const gitBuild = detectGitBuild();

export default defineConfig({
	source: ["src", "addon"],
	dist: ".scaffold/build",
	name: pkg.config.addonName,
	id: pkg.config.addonID,
	namespace: pkg.config.addonRef,
	build: {
		assets: ["addon/**/*.*"],
		define: {
			...pkg.config,
			author: pkg.author,
			description: pkg.description,
			homepage: pkg.homepage,
			buildVersion: pkg.version,
			buildTime: "{{buildTime}}",
			updateURL: "",
		},
		prefs: {
			prefix: pkg.config.prefsPrefix,
		},
		esbuildOptions: [
			{
				entryPoints: ["src/index.ts"],
				define: {
					__env__: `"${process.env.NODE_ENV}"`,
					__zctr_build_version__: JSON.stringify(pkg.version),
					__zctr_git_hash__: JSON.stringify(gitBuild.hash),
					__zctr_is_release__: gitBuild.isRelease ? "true" : "false",
				},
				bundle: true,
				target: "firefox115",
				outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
			},
		],
	},
	release: {
		bumpp: {
			// Run the build before releasing (used in CI)
			execute: "npm run build",
		},
		github: {
			// Only release to GitHub in CI; locally `zotero-plugin release`
			// just bumps the version, commits and pushes the tag
			enable: "ci",
		},
	},
});
