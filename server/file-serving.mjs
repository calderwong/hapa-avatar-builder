import { createReadStream } from "node:fs";

const telemetry = {
  active: 0,
  opened: 0,
  closed: 0,
  aborted: 0,
  errors: 0
};

export function streamFileToResponse(req, res, filePath, options = {}) {
  const streamOptions = {};
  if (Number.isFinite(options.start)) streamOptions.start = options.start;
  if (Number.isFinite(options.end)) streamOptions.end = options.end;

  const stream = createReadStream(filePath, streamOptions);
  telemetry.active += 1;
  telemetry.opened += 1;

  let finalized = false;
  let responseFinished = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    telemetry.active = Math.max(0, telemetry.active - 1);
    telemetry.closed += 1;
    req?.removeListener("aborted", abortStream);
    res?.removeListener("close", closeStream);
    res?.removeListener("finish", finishStream);
  };

  const destroyStream = () => {
    if (!stream.destroyed) stream.destroy();
  };

  const abortStream = () => {
    telemetry.aborted += 1;
    destroyStream();
  };

  const closeStream = () => {
    if (!responseFinished) telemetry.aborted += 1;
    destroyStream();
  };

  const finishStream = () => {
    responseFinished = true;
    destroyStream();
  };

  req?.once("aborted", abortStream);
  res?.once("close", closeStream);
  res?.once("finish", finishStream);

  stream.once("error", (error) => {
    telemetry.errors += 1;
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(`${JSON.stringify({ ok: false, error: "file_stream_failed", message: error.message })}\n`);
    } else if (!res.destroyed) {
      res.destroy(error);
    }
  });
  stream.once("close", finalize);
  stream.pipe(res);
  return stream;
}

export function fileStreamTelemetry() {
  return { ...telemetry };
}
