"use strict";

const { inputError, jsonFrom, paraplexRequest, RENDER_ENDED, RUN_ENDED, SCALES, slotsFrom, waitUntil } = require("./shared");

/**
 * Paraplex in n8n: render a template with its slots filled (and wait for the
 * film), read and cancel renders, list templates and their slots, and run an
 * automation (and wait for its run). Every call goes to Paraplex's public
 * API, /api/v1, with the account's API key.
 */

const show = (resource, operation) => ({ show: { resource: [resource], ...(operation ? { operation: [operation] } : {}) } });

const waitFields = (resource, operation, { waitDefault, waitLabel, limitDefault }) => [
  {
    displayName: waitLabel,
    name: "waitForCompletion",
    type: "boolean",
    default: waitDefault,
    displayOptions: show(resource, operation),
    description: "Whether to hold the workflow here, asking every 10 seconds, until it ends, then pass on the result",
  },
  {
    displayName: "Wait Up To (Minutes)",
    name: "waitMinutes",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 120 },
    default: limitDefault,
    displayOptions: { show: { resource: [resource], operation: [operation], waitForCompletion: [true] } },
    description: "After this long the node stops waiting and fails, naming what to read later",
  },
];

class Paraplex {
  constructor() {
    this.description = {
      displayName: "Paraplex",
      name: "paraplex",
      icon: "file:paraplex.svg",
      group: ["transform"],
      version: 1,
      subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
      description: "Render Paraplex templates into videos and run Paraplex automations",
      defaults: { name: "Paraplex" },
      inputs: ["main"],
      outputs: ["main"],
      usableAsTool: true,
      credentials: [{ name: "paraplexApi", required: true }],
      properties: [
        {
          displayName: "Resource",
          name: "resource",
          type: "options",
          noDataExpression: true,
          options: [
            { name: "Render", value: "render" },
            { name: "Template", value: "template" },
            { name: "Automation", value: "automation" },
          ],
          default: "render",
        },

        // ---------------------------------------------------------------- Render
        {
          displayName: "Operation",
          name: "operation",
          type: "options",
          noDataExpression: true,
          displayOptions: show("render"),
          options: [
            { name: "Create", value: "create", action: "Render a template", description: "Render a template with its slots filled, on Paraplex's cloud" },
            { name: "Get", value: "get", action: "Get a render", description: "A render's status, and its download link once made" },
            { name: "Get Many", value: "getAll", action: "Get many renders", description: "The account's API renders, newest first" },
            { name: "Cancel", value: "cancel", action: "Cancel a render", description: "Stop a render that hasn't finished; its minutes come back" },
          ],
          default: "create",
        },
        {
          displayName: "Template Name or ID",
          name: "template",
          type: "options",
          typeOptions: { loadOptionsMethod: "getTemplates" },
          required: true,
          default: "",
          displayOptions: show("render", "create"),
          description: 'The template to render. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        },
        {
          displayName: "Slots",
          name: "slots",
          placeholder: "Add Slot",
          type: "fixedCollection",
          typeOptions: { multipleValues: true },
          default: {},
          displayOptions: show("render", "create"),
          description: "The template's words, numbers, colors and pictures to fill; the rest keep the template's own",
          options: [
            {
              name: "slot",
              displayName: "Slot",
              values: [
                {
                  displayName: "Slot Name or ID",
                  name: "name",
                  type: "options",
                  typeOptions: { loadOptionsMethod: "getTemplateSlots", loadOptionsDependsOn: ["template"] },
                  default: "",
                  description: 'The slot to fill. Choose from the list, or specify a name using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
                },
                {
                  displayName: "Value",
                  name: "value",
                  type: "string",
                  default: "",
                  description: "Words for a text slot, a number for a counter, #rrggbb for a color, an https link to a PNG, JPEG, WebP or GIF for a picture",
                },
              ],
            },
          ],
        },
        {
          displayName: "Options",
          name: "options",
          type: "collection",
          placeholder: "Add Option",
          default: {},
          displayOptions: show("render", "create"),
          options: [
            {
              displayName: "Design System",
              name: "designSystem",
              type: "string",
              default: "",
              description: "Restyle the template in a design system: Paraplex's by name, or one of the account's own by its ID",
            },
            {
              displayName: "Format",
              name: "format",
              type: "options",
              options: [
                { name: "MP4", value: "mp4" },
                { name: "WebM", value: "webm" },
              ],
              default: "mp4",
            },
            {
              displayName: "Name",
              name: "name",
              type: "string",
              default: "",
              description: "What the render is called; the template's name if empty",
            },
            {
              displayName: "Size",
              name: "scale",
              type: "options",
              options: SCALES.map((scale) => ({ name: `${scale}× the template's size`, value: scale })),
              default: 1,
            },
            {
              displayName: "Webhook URL",
              name: "webhookUrl",
              type: "string",
              default: "",
              placeholder: "https://…",
              description: "An https address Paraplex calls, signed, when the render finishes; the secret comes back once, with the render",
            },
          ],
        },
        ...waitFields("render", "create", { limitDefault: 15, waitDefault: true, waitLabel: "Wait for the Render to Finish" }),
        {
          displayName: "Render ID",
          name: "renderId",
          type: "string",
          required: true,
          default: "",
          displayOptions: { show: { resource: ["render"], operation: ["get", "cancel"] } },
        },
        {
          displayName: "Limit",
          name: "limit",
          type: "number",
          typeOptions: { minValue: 1, maxValue: 50 },
          default: 50,
          displayOptions: show("render", "getAll"),
          description: "Max number of results to return",
        },

        // -------------------------------------------------------------- Template
        {
          displayName: "Operation",
          name: "operation",
          type: "options",
          noDataExpression: true,
          displayOptions: show("template"),
          options: [
            { name: "Get", value: "get", action: "Get a template", description: "A template with its slots" },
            { name: "Get Many", value: "getAll", action: "Get many templates", description: "Every template, without its slots" },
          ],
          default: "getAll",
        },
        {
          displayName: "Template Name or ID",
          name: "templateId",
          type: "options",
          typeOptions: { loadOptionsMethod: "getTemplates" },
          required: true,
          default: "",
          displayOptions: show("template", "get"),
          description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
        },

        // ------------------------------------------------------------ Automation
        {
          displayName: "Operation",
          name: "operation",
          type: "options",
          noDataExpression: true,
          displayOptions: show("automation"),
          options: [
            { name: "Run", value: "run", action: "Run an automation", description: "Start a run of an automation, with input of its own" },
            { name: "Get", value: "get", action: "Get an automation", description: "An automation, its steps and its last run" },
            { name: "Get Many", value: "getAll", action: "Get many automations" },
            { name: "Get Run", value: "getRun", action: "Get a run of an automation", description: "A run with its log and its steps' outputs" },
            { name: "Get Runs", value: "getRuns", action: "Get runs of an automation", description: "An automation's runs, newest first" },
          ],
          default: "run",
        },
        {
          displayName: "Automation Name or ID",
          name: "automationId",
          type: "options",
          typeOptions: { loadOptionsMethod: "getAutomations" },
          required: true,
          default: "",
          displayOptions: { show: { resource: ["automation"], operation: ["run", "get", "getRun", "getRuns"] } },
          description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
        },
        {
          displayName: "Input (JSON)",
          name: "input",
          type: "json",
          default: "{}",
          displayOptions: show("automation", "run"),
          description: 'What the run starts with. Its steps read it as {{trigger.…}}: {"title": "Spring"} is {{trigger.title}}.',
        },
        ...waitFields("automation", "run", { limitDefault: 30, waitDefault: false, waitLabel: "Wait for the Run to Finish" }),
        {
          displayName: "Run ID",
          name: "runId",
          type: "string",
          required: true,
          default: "",
          displayOptions: show("automation", "getRun"),
        },
        {
          displayName: "Limit",
          name: "limit",
          type: "number",
          typeOptions: { minValue: 1, maxValue: 50 },
          default: 50,
          displayOptions: { show: { resource: ["automation"], operation: ["getAll", "getRuns"] } },
          description: "Max number of results to return",
        },
      ],
    };

    this.methods = {
      loadOptions: {
        async getTemplates() {
          const { templates } = await paraplexRequest.call(this, "GET", "/templates");

          return (Array.isArray(templates) ? templates : [])
            .filter((template) => template && typeof template.id === "string")
            .map((template) => ({
              description:
                template.width && template.height
                  ? `${template.width}×${template.height}, ${template.durationSeconds} s, ${template.slotCount} slot${template.slotCount === 1 ? "" : "s"}`
                  : undefined,
              name: String(template.label ?? template.name ?? template.id),
              value: template.id,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        async getTemplateSlots() {
          const id = this.getCurrentNodeParameter("template");

          if (typeof id !== "string" || !id) {
            return [];
          }

          const { template } = await paraplexRequest.call(this, "GET", `/templates/${encodeURIComponent(id)}`);

          return (template?.slots ?? []).map((slot) => ({
            description: slot.value ? `Now: ${String(slot.value).slice(0, 80)}` : undefined,
            name: `${slot.name} (${slot.kind})`,
            value: slot.name,
          }));
        },
        async getAutomations() {
          const { automations } = await paraplexRequest.call(this, "GET", "/automations");

          return (Array.isArray(automations) ? automations : []).map((automation) => ({
            description: `${automation.enabled ? "" : "Off. "}${automation.trigger ?? ""}`.trim(),
            name: automation.name,
            value: automation.id,
          }));
        },
      },
    };
  }

  async execute() {
    const items = this.getInputData();
    const returned = [];

    for (let index = 0; index < items.length; index += 1) {
      try {
        const resource = this.getNodeParameter("resource", index);
        const operation = this.getNodeParameter("operation", index);
        const answer = await runOperation.call(this, resource, operation, index);

        for (const json of Array.isArray(answer) ? answer : [answer]) {
          returned.push({ json, pairedItem: { item: index } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returned.push({ json: { error: error.message }, pairedItem: { item: index } });
          continue;
        }

        throw error;
      }
    }

    return [returned];
  }
}

/** One item's call, as the execute context. */
async function runOperation(resource, operation, index) {
  const node = this.getNode();
  const id = (name) => {
    const value = String(this.getNodeParameter(name, index) ?? "").trim();

    if (!value) {
      throw inputError(node, `Set ${name}.`, index);
    }

    return encodeURIComponent(value);
  };

  if (resource === "template") {
    if (operation === "getAll") {
      return (await paraplexRequest.call(this, "GET", "/templates")).templates ?? [];
    }

    return (await paraplexRequest.call(this, "GET", `/templates/${id("templateId")}`)).template;
  }

  if (resource === "render") {
    if (operation === "create") {
      const options = this.getNodeParameter("options", index, {});
      const body = {
        slots: slotsFrom(this.getNodeParameter("slots", index, {}).slot),
        template: decodeURIComponent(id("template")),
        ...(options.format ? { format: options.format } : {}),
        ...(options.scale ? { scale: Number(options.scale) } : {}),
        ...(options.name ? { name: options.name } : {}),
        ...(options.designSystem ? { designSystem: options.designSystem } : {}),
        ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
      };
      const created = await paraplexRequest.call(this, "POST", "/renders", body);
      const extra = { ...(created.webhookSecret ? { webhookSecret: created.webhookSecret } : {}), ...(created.minutes ? { minutes: created.minutes } : {}) };

      if (!this.getNodeParameter("waitForCompletion", index, true)) {
        return { ...created.render, ...extra };
      }

      const renderId = created.render.id;
      const waited = await waitUntil(
        async () => (await paraplexRequest.call(this, "GET", `/renders/${encodeURIComponent(renderId)}`)).render,
        (render) => RENDER_ENDED.includes(render?.status),
        { limitMs: this.getNodeParameter("waitMinutes", index, 15) * 60_000 },
      );

      if (!waited.ended) {
        throw inputError(node, `Render ${renderId} hasn't finished yet (${waited.last?.status}${waited.last?.note ? `: ${waited.last.note}` : ""}). Read it later with Get, or wait longer.`, index);
      }

      if (waited.last.status !== "done") {
        throw inputError(node, `Render ${renderId} ${waited.last.status === "cancelled" ? "was cancelled" : `failed${waited.last.error ? `: ${waited.last.error}` : "."}`}`, index);
      }

      return { ...waited.last, ...extra };
    }

    if (operation === "get") {
      return (await paraplexRequest.call(this, "GET", `/renders/${id("renderId")}`)).render;
    }

    if (operation === "cancel") {
      return (await paraplexRequest.call(this, "POST", `/renders/${id("renderId")}/cancel`, {})).render;
    }

    const limit = this.getNodeParameter("limit", index, 50);

    return ((await paraplexRequest.call(this, "GET", "/renders")).renders ?? []).slice(0, limit);
  }

  if (resource === "automation") {
    if (operation === "getAll") {
      return ((await paraplexRequest.call(this, "GET", "/automations")).automations ?? []).slice(0, this.getNodeParameter("limit", index, 50));
    }

    const automation = id("automationId");

    if (operation === "get") {
      return (await paraplexRequest.call(this, "GET", `/automations/${automation}`)).automation;
    }

    if (operation === "getRuns") {
      return ((await paraplexRequest.call(this, "GET", `/automations/${automation}/runs`)).runs ?? []).slice(0, this.getNodeParameter("limit", index, 50));
    }

    if (operation === "getRun") {
      return (await paraplexRequest.call(this, "GET", `/automations/${automation}/runs/${id("runId")}`)).run;
    }

    const input = jsonFrom(this.getNodeParameter("input", index, "{}"), node, "Input", index);
    const { run } = await paraplexRequest.call(this, "POST", `/automations/${automation}/runs`, { input });

    if (!this.getNodeParameter("waitForCompletion", index, false)) {
      return run;
    }

    const waited = await waitUntil(
      async () => (await paraplexRequest.call(this, "GET", `/automations/${automation}/runs/${encodeURIComponent(run.id)}`)).run,
      (read) => RUN_ENDED.includes(read?.status),
      { limitMs: this.getNodeParameter("waitMinutes", index, 30) * 60_000 },
    );

    if (!waited.ended) {
      const why = waited.last?.status === "waiting" && waited.last?.approval ? "it is waiting for approval" : `it is ${waited.last?.status}`;

      throw inputError(node, `Run ${run.id} hasn't finished yet: ${why}. Read it later with Get Run, or wait longer.`, index);
    }

    if (waited.last.status !== "done") {
      throw inputError(node, `Run ${run.id} ${waited.last.status === "cancelled" ? "was cancelled" : `failed${waited.last.error ? `: ${waited.last.error}` : "."}`}`, index);
    }

    return waited.last;
  }

  throw inputError(node, `No such resource: ${resource}.`, index);
}

module.exports = { Paraplex };
