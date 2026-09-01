/**
 * OpenNext's build starts with fs.rmSync(".open-next"). On Windows that
 * fails with EPERM when `npm run dev` has workerd holding the folder
 * (wrangler.jsonc points main at .open-next/worker.js for local D1).
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const dir = ".open-next";

function remove() {
	rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (!existsSync(dir)) {
	process.exit(0);
}

try {
	remove();
	process.exit(0);
} catch {
	if (process.platform === "win32") {
		spawnSync("taskkill", ["/IM", "workerd.exe", "/F"], { stdio: "ignore" });
		try {
			remove();
			process.exit(0);
		} catch {
			// fall through
		}
	}

	console.error(
		"Could not remove .open-next. Stop `npm run dev` (workerd locks this folder on Windows) and retry.",
	);
	process.exit(1);
}
