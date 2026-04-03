export function createNetLog({ enabled, importantEnabled, importantEvents }) {
  const important = importantEvents instanceof Set ? importantEvents : new Set();
  return function netLog(event, data) {
    if (!enabled && !(importantEnabled && important.has(event))) return;
    const t = (Date.now() / 1000).toFixed(3);
    if (data === undefined) process.stdout.write(`[net ${t}] ${event}\n`);
    else process.stdout.write(`[net ${t}] ${event} ${JSON.stringify(data)}\n`);
  };
}

