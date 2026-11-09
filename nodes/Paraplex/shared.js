"use strict";

/**
 * What the Paraplex node and its trigger share: calls to Paraplex's public
 * API (`/api/v1`) with the account's API key, its errors as n8n's own, and a
 * pause for the waits. n8n-workflow is the host's: it is required when the
 * node runs inside n8n, and stood in for when it doesn't (the tests).
 */

let workflow = null;

try {
  workflow = require("n8n-workflow");
} catch {
  workflow = null;
}

/** The render states after which a render changes no more. */
const RENDER_ENDED = ["done", "failed", "cancelled"];

/** The run states after which an automation's run changes no more. */
const RUN_ENDED = ["done", "failed", "cancelled"];

/** A render's size: the template's, times this. */
const SCALES = [1, 1.5, 2];

/** How often a wait asks again, in seconds. */
const POLL_SECONDS = 10;

/** The wait's pace, which the package's tests shorten. */
const timing = { everyMs: POLL_SECONDS * 1000 };

/** The site's address from the credential, without a trailing slash. */
function baseUrl(credentials) {
  const given = typeof credentials?.baseUrl === "string" && credentials.baseUrl.trim() ? credentials.baseUrl.trim() : "https://app.paraplex.ai";

  return given.replace(/\/+$/, "");
}

/** The error n8n shows for a call that went wrong, with Paraplex's own words. */
function apiError(node, error) {
  // n8n's own request helper already wraps a refusal in a NodeApiError, with
  // the answer's body under context.data or the cause's response.
  const bodies = [
    error?.response?.body,
    error?.response?.data,
    error?.cause?.response?.body,
    error?.cause?.response?.data,
    error?.context?.data,
    error?.error,
  ];
  const body = bodies.find((candidate) => candidate && typeof candidate === "object" && typeof candidate.error === "string");
  const said = body ? body.error : typeof error?.message === "string" && error.message ? error.message : "Paraplex didn't answer.";
  const status = error?.httpCode ?? error?.response?.status ?? error?.cause?.response?.status ?? error?.cause?.status ?? error?.statusCode;

  if (workflow?.NodeApiError && node) {
    // A plain object, so n8n builds a fresh error with Paraplex's words
    // rather than handing back its own wrapped one unchanged.
    const httpCode = status ? String(status) : undefined;

    return new workflow.NodeApiError(node, { message: said, ...(httpCode ? { httpCode } : {}) }, { message: said, ...(httpCode ? { httpCode } : {}) });
  }

  const plain = new Error(said);

  plain.httpCode = status ? String(status) : undefined;

  return plain;
}

/** An error in what the node was given, before any call. */
function inputError(node, message, itemIndex) {
  if (workflow?.NodeOperationError && node) {
    return new workflow.NodeOperationError(node, message, itemIndex === undefined ? undefined : { itemIndex });
  }

  return new Error(message);
}

/**
 * One call to the API, as `this` (an n8n execute, load-options or poll
 * context): the key goes in through the credential's own authentication.
 */
async function paraplexRequest(method, path, body, query) {
  const credentials = await this.getCredentials("paraplexApi");
  const options = {
    json: true,
    method,
    url: `${baseUrl(credentials)}/api/v1${path}`,
    ...(body === undefined ? {} : { body }),
    ...(query === undefined ? {} : { qs: query }),
  };

  try {
    return await this.helpers.httpRequestWithAuthentication.call(this, "paraplexApi", options);
  } catch (error) {
    throw apiError(this.getNode?.(), error);
  }
}

/** A pause: n8n's own when it runs there, a timer otherwise. */
function pause(ms) {
  return workflow?.sleep ? workflow.sleep(ms) : new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asks `read` again every POLL_SECONDS until `ended` says so or `limitMs`
 * passes; then the last answer. `pauseFn` stands in for the pause in tests.
 */
async function waitUntil(read, ended, { limitMs, everyMs = timing.everyMs, pauseFn = pause, now = Date.now }) {
  const until = now() + limitMs;
  let last = await read();

  while (!ended(last) && now() + everyMs <= until) {
    await pauseFn(everyMs);
    last = await read();
  }

  return { ended: ended(last), last };
}

/** The slots a render takes, from the node's list of name and value pairs; later names win. */
function slotsFrom(pairs) {
  const slots = {};

  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const name = typeof pair?.name === "string" ? pair.name.trim() : "";

    if (name) {
      slots[name] = typeof pair.value === "number" ? String(pair.value) : String(pair.value ?? "");
    }
  }

  return slots;
}

/** JSON the node was given as text, or as an object already (an expression). */
function jsonFrom(value, node, field, itemIndex) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    throw inputError(node, `${field} isn't valid JSON.`, itemIndex);
  }
}

module.exports = { apiError, baseUrl, inputError, jsonFrom, paraplexRequest, pause, POLL_SECONDS, RENDER_ENDED, RUN_ENDED, SCALES, slotsFrom, timing, waitUntil };
