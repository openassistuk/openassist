import fs from "node:fs";
import { unpackRelease, readBuildIdentity, platformArtifact } from "../../apps/openassist-cli/src/lib/release.js";
const [archive, target, version] = process.argv.slice(2);
// Check native compatibility before loading any application/provider/storage modules.
platformArtifact({artifacts:[{platform:process.platform,arch:process.arch}]} as never);
unpackRelease(fs.readFileSync(archive),target);
const build = readBuildIdentity(target);
if (version && build.version !== version) throw new Error("Bootstrap artifact does not match the signed version.");
