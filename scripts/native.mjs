import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localSdk = resolve(root, '.tools/dotnet/dotnet.exe');
const dotnet = process.env.DOTNET_EXE || (existsSync(localSdk) ? localSdk : 'dotnet');
const env = { ...process.env, DOTNET_CLI_HOME: resolve(root, '.cache/dotnet-home'), DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', NUGET_PACKAGES: resolve(root, '.cache/nuget') };
mkdirSync(env.DOTNET_CLI_HOME, { recursive: true });
let args;
if (process.argv[2] === 'checks') args = ['run', '--project', 'native/Checks/Checks.csproj', '-c', 'Release'];
else args = ['publish', 'native/Collector/Collector.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-p:PublishSingleFile=true', '-o', 'native/publish'];
const result = spawnSync(dotnet, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) { console.error('Install a .NET 10 SDK or set DOTNET_EXE.'); console.error(result.error.message); }
process.exit(result.status ?? 1);
