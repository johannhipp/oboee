import { defineSchema } from "convex/server";

import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  passkey: tables.passkey.index("credentialID", ["credentialID"]),
  apikey: tables.apikey
    .index("key", ["key"])
    .index("referenceId", ["referenceId"])
    .index("referenceId_configId", ["referenceId", "configId"])
    .index("expiresAt", ["expiresAt"]),
});

export default schema;
