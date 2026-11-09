"use strict";

/**
 * A Paraplex API key (pxk_…), made in Paraplex's Account window › API keys.
 * Sent as a bearer token; tested against GET /api/v1/whoami.
 */
class ParaplexApi {
  constructor() {
    this.name = "paraplexApi";
    this.displayName = "Paraplex API";
    this.documentationUrl = "https://app.paraplex.ai/api/v1/openapi.json";
    this.icon = "file:../nodes/Paraplex/paraplex.svg";
    this.properties = [
      {
        displayName: "API Key",
        name: "apiKey",
        type: "string",
        typeOptions: { password: true },
        default: "",
        required: true,
        placeholder: "pxk_…",
        description: "Make one in Paraplex: the Account window, then API keys, under Paraplex API keys (keys come with Pro). Rendering and running automations need a key that may Render.",
      },
      {
        displayName: "Base URL",
        name: "baseUrl",
        type: "string",
        default: "https://app.paraplex.ai",
        description: "Leave as it is unless Paraplex gave you another address",
      },
    ];
    this.authenticate = {
      type: "generic",
      properties: {
        headers: {
          Authorization: "=Bearer {{$credentials.apiKey}}",
        },
      },
    };
    this.test = {
      request: {
        baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
        url: "/api/v1/whoami",
      },
    };
  }
}

module.exports = { ParaplexApi };
