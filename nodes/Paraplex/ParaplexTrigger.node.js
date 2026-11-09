"use strict";

const { paraplexRequest } = require("./shared");

/**
 * Starts a workflow when a Paraplex render finishes or fails, or when a run
 * of an automation ends. n8n asks on its schedule (Poll Times); the first
 * time, it notes the time and passes on nothing that ended before it, so
 * turning the workflow on never replays old renders. "Fetch Test Event"
 * passes on the newest one that matches.
 */

const RENDER_STATES = { renderDone: ["done"], renderFailed: ["failed", "cancelled"] };

/** How many ended runs one check reads in full (log and outputs). */
const FULL_RUNS = 10;

class ParaplexTrigger {
  constructor() {
    this.description = {
      displayName: "Paraplex Trigger",
      name: "paraplexTrigger",
      icon: "file:paraplex.svg",
      group: ["trigger"],
      version: 1,
      subtitle: '={{$parameter["event"]}}',
      description: "Starts the workflow when a Paraplex render finishes or an automation's run ends",
      defaults: { name: "Paraplex Trigger" },
      polling: true,
      inputs: [],
      outputs: ["main"],
      credentials: [{ name: "paraplexApi", required: true }],
      properties: [
        {
          displayName: "Event",
          name: "event",
          type: "options",
          options: [
            { name: "Render Finished", value: "renderDone", description: "A render made through the API is ready, with its download link" },
            { name: "Render Failed", value: "renderFailed", description: "A render made through the API failed or was cancelled" },
            { name: "Automation Run Ended", value: "runEnded", description: "A run of an automation ended, with its log and its steps' outputs" },
          ],
          default: "renderDone",
        },
        {
          displayName: "Automation Name or ID",
          name: "automationId",
          type: "options",
          typeOptions: { loadOptionsMethod: "getAutomations" },
          required: true,
          default: "",
          displayOptions: { show: { event: ["runEnded"] } },
          description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
        },
        {
          displayName: "Ended As",
          name: "runStates",
          type: "multiOptions",
          options: [
            { name: "Done", value: "done" },
            { name: "Failed", value: "failed" },
            { name: "Cancelled", value: "cancelled" },
          ],
          default: ["done"],
          displayOptions: { show: { event: ["runEnded"] } },
        },
      ],
    };

    this.methods = {
      loadOptions: {
        async getAutomations() {
          const { automations } = await paraplexRequest.call(this, "GET", "/automations");

          return (Array.isArray(automations) ? automations : []).map((automation) => ({ description: automation.trigger ?? undefined, name: automation.name, value: automation.id }));
        },
      },
    };
  }

  async poll() {
    const event = this.getNodeParameter("event");
    const manual = this.getMode() === "manual";
    let ended;
    let automation = "";

    if (event === "runEnded") {
      automation = encodeURIComponent(String(this.getNodeParameter("automationId")));
      const states = this.getNodeParameter("runStates", ["done"]);
      const { runs } = await paraplexRequest.call(this, "GET", `/automations/${automation}/runs`);

      ended = (Array.isArray(runs) ? runs : []).filter((run) => run.finishedAt && states.includes(run.status));
    } else {
      const states = RENDER_STATES[event] ?? RENDER_STATES.renderDone;
      const { renders } = await paraplexRequest.call(this, "GET", "/renders");

      ended = (Array.isArray(renders) ? renders : []).filter((render) => render.finishedAt && states.includes(render.status));
    }

    const at = (entry) => Date.parse(entry.finishedAt) || 0;

    ended.sort((a, b) => at(a) - at(b));

    const full = async (list) =>
      event === "runEnded"
        ? Promise.all(list.map(async (run, index) => (index < FULL_RUNS ? ((await paraplexRequest.call(this, "GET", `/automations/${automation}/runs/${encodeURIComponent(run.id)}`)).run ?? run) : run)))
        : list;

    if (manual) {
      const newest = ended.at(-1);

      return newest ? [(await full([newest])).map((json) => ({ json }))] : null;
    }

    // Kept by event (and automation), so choosing another starts afresh.
    const store = this.getWorkflowStaticData("node");
    const key = event === "runEnded" ? `runEnded:${automation}` : event;
    const seen = (store[key] = typeof store[key] === "object" && store[key] !== null ? store[key] : {});

    if (typeof seen.sinceMs !== "number") {
      // The first check: what has ended already isn't news. Paraplex's own
      // times, not this machine's clock, so a clock that runs ahead misses nothing.
      const newest = ended.at(-1);

      seen.sinceMs = newest ? at(newest) : 0;
      seen.ids = ended.filter((entry) => at(entry) === seen.sinceMs).map((entry) => entry.id);

      return null;
    }

    const since = seen.sinceMs;
    const ids = Array.isArray(seen.ids) ? seen.ids : [];
    const fresh = ended.filter((entry) => at(entry) > since || (at(entry) === since && !ids.includes(entry.id)));

    if (fresh.length === 0) {
      return null;
    }

    const newest = Math.max(since, ...fresh.map(at));

    seen.sinceMs = newest;
    seen.ids = ended.filter((entry) => at(entry) === newest).map((entry) => entry.id);

    return [(await full(fresh)).map((json) => ({ json }))];
  }
}

module.exports = { ParaplexTrigger };
