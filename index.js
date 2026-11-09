"use strict";

// n8n loads the nodes and the credential from package.json's "n8n" list;
// this is for anything that requires the package itself.
module.exports = {
  ...require("./credentials/ParaplexApi.credentials.js"),
  ...require("./nodes/Paraplex/Paraplex.node.js"),
  ...require("./nodes/Paraplex/ParaplexTrigger.node.js"),
};
