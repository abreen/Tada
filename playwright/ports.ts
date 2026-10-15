// Ports for the Playwright test servers. The runner picks free ports once and
// stores them in the environment, which its workers and web servers inherit,
// so several worktrees can run the suite at the same time. Set a variable
// before running the tests to pin its port.
import net from 'net';

const portVariables = {
  test: 'TADA_PW_PORT_TEST',
  appearance: 'TADA_PW_PORT_APPEARANCE',
  noNavSearch: 'TADA_PW_PORT_NO_NAV_SEARCH',
  noNavStatic: 'TADA_PW_PORT_NO_NAV_STATIC',
} as const;

type Ports = Record<keyof typeof portVariables, number>;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not read the assigned port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

export async function assignPorts(): Promise<Ports> {
  for (const variable of Object.values(portVariables)) {
    if (!process.env[variable]) {
      process.env[variable] = String(await freePort());
    }
  }
  return getPorts();
}

function readPort(variable: string): number {
  const port = Number(process.env[variable]);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`${variable} is not set; run the tests with Playwright`);
  }
  return port;
}

export function getPorts(): Ports {
  return {
    test: readPort(portVariables.test),
    appearance: readPort(portVariables.appearance),
    noNavSearch: readPort(portVariables.noNavSearch),
    noNavStatic: readPort(portVariables.noNavStatic),
  };
}

// Origin of the site without a nav file, with or without search
export function noNavSiteOrigin(search: boolean): string {
  const ports = getPorts();
  return `http://localhost:${search ? ports.noNavSearch : ports.noNavStatic}`;
}

// URL on the appearance defaults site, which is mounted under /custom
export function appearanceSiteUrl(pathname = ''): string {
  return `http://localhost:${getPorts().appearance}/custom${pathname}`;
}

// Reads the required `--port <n>` argument of a serve script
export function portArgument(args: string[]): string {
  const index = args.indexOf('--port');
  const port = index === -1 ? undefined : args[index + 1];
  if (!port || !/^\d+$/.test(port)) {
    throw new Error('Pass the server port with --port <n>');
  }
  return port;
}
