const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export const config = Object.freeze({ port });
