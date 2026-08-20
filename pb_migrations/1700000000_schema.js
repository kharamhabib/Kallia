/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    // 1. Projects collection
    try {
        let projects = null;
        try {
            projects = app.findCollectionByNameOrId("projects");
        } catch (_) {}

        if (!projects) {
            projects = new Collection({
                name: "projects",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != '' && (@request.auth.role = 'creator' || @request.auth.role = 'appadmin')",
                deleteRule: "@request.auth.role = 'appadmin'",
                fields: [
                    { name: "name", type: "text", required: true },
                    { name: "plan", type: "select", values: ["trial", "basic", "advantage", "expert"], required: true },
                    { name: "plan_status", type: "select", values: ["active", "inactive", "canceled"], required: true },
                    { name: "plan_starts_at", type: "date" },
                    { name: "plan_ends_at", type: "date" }
                ]
            });
            app.save(projects);
        }
    } catch (err) {
        console.log("[Migration] Info projects collection:", err);
    }

    // 2. Extend users collection
    try {
        const users = app.findCollectionByNameOrId("users");
        if (users && users.fields) {
            try {
                users.fields.add(new Field({
                    name: "role",
                    type: "select",
                    values: ["appadmin", "creator", "normal"],
                    required: true
                }));
            } catch (_) {}
            try {
                users.fields.add(new Field({
                    name: "project_id",
                    type: "text"
                }));
            } catch (_) {}
            app.save(users);
        }
    } catch (err) {
        console.log("[Migration] Info users collection:", err);
    }

    // 3. Sessions collection (Conexões WhatsApp)
    try {
        let sessions = null;
        try {
            sessions = app.findCollectionByNameOrId("sessions");
        } catch (_) {}

        if (!sessions) {
            sessions = new Collection({
                name: "sessions",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != '' && (@request.auth.role = 'creator' || @request.auth.role = 'appadmin')",
                fields: [
                    { name: "name", type: "text", required: true },
                    { name: "jid", type: "text" },
                    { name: "webhook", type: "url" },
                    { name: "chatwoot", type: "json" },
                    { name: "ai_config", type: "json" },
                    { name: "project_id", type: "text", required: true },
                    { name: "api_key", type: "text" }
                ]
            });
            app.save(sessions);
        }
    } catch (err) {
        console.log("[Migration] Info sessions collection:", err);
    }

    // 4. Agents collection (Personas Especialistas)
    try {
        let agents = null;
        try {
            agents = app.findCollectionByNameOrId("agents");
        } catch (_) {}

        if (!agents) {
            agents = new Collection({
                name: "agents",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != ''",
                fields: [
                    { name: "session_id", type: "text", required: true },
                    { name: "name", type: "text", required: true },
                    { name: "description", type: "text" },
                    { name: "ai_config", type: "json", required: true },
                    { name: "inbound", type: "bool" },
                    { name: "outbound", type: "bool" }
                ]
            });
            app.save(agents);
        }
    } catch (err) {
        console.log("[Migration] Info agents collection:", err);
    }

    // 5. Contacts (CRM) collection
    try {
        let contacts = null;
        try {
            contacts = app.findCollectionByNameOrId("contacts");
        } catch (_) {}

        if (!contacts) {
            contacts = new Collection({
                name: "contacts",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != ''",
                fields: [
                    { name: "session_id", type: "text", required: true },
                    { name: "phone", type: "text", required: true },
                    { name: "name", type: "text" },
                    { name: "email", type: "email" },
                    { name: "company", type: "text" },
                    { name: "notes", type: "text" },
                    { name: "avatar_url", type: "text" },
                    { name: "lid", type: "text" },
                    { name: "jid", type: "text" },
                    { name: "tags", type: "json" },
                    { name: "enriched_at", type: "date" }
                ]
            });
            app.save(contacts);
        }
    } catch (err) {
        console.log("[Migration] Info contacts collection:", err);
    }

    // 6. Call History collection
    try {
        let callHistory = null;
        try {
            callHistory = app.findCollectionByNameOrId("call_history");
        } catch (_) {}

        if (!callHistory) {
            callHistory = new Collection({
                name: "call_history",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != ''",
                fields: [
                    { name: "session_id", type: "text", required: true },
                    { name: "call_id", type: "text", required: true },
                    { name: "owner", type: "text" },
                    { name: "direction", type: "select", values: ["inbound", "outbound"] },
                    { name: "peer", type: "text" },
                    { name: "started_at", type: "number" },
                    { name: "ended_at", type: "number" },
                    { name: "end_reason", type: "text" },
                    { name: "summary", type: "text" },
                    { name: "ticket_opened", type: "bool" },
                    { name: "ticket_reason", type: "text" },
                    { name: "recording_url", type: "text" }
                ]
            });
            app.save(callHistory);
        }
    } catch (err) {
        console.log("[Migration] Info call_history collection:", err);
    }

    // 7. Call Transcripts collection
    try {
        let callTranscripts = null;
        try {
            callTranscripts = app.findCollectionByNameOrId("call_transcripts");
        } catch (_) {}

        if (!callTranscripts) {
            callTranscripts = new Collection({
                name: "call_transcripts",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != ''",
                fields: [
                    { name: "session_id", type: "text", required: true },
                    { name: "call_id", type: "text", required: true },
                    { name: "speaker", type: "text", required: true },
                    { name: "text", type: "text", required: true }
                ]
            });
            app.save(callTranscripts);
        }
    } catch (err) {
        console.log("[Migration] Info call_transcripts collection:", err);
    }

    // 8. AI Providers collection
    try {
        let aiProviders = null;
        try {
            aiProviders = app.findCollectionByNameOrId("ai_providers");
        } catch (_) {}

        if (!aiProviders) {
            aiProviders = new Collection({
                name: "ai_providers",
                type: "base",
                listRule: "@request.auth.id != ''",
                viewRule: "@request.auth.id != ''",
                createRule: "@request.auth.id != ''",
                updateRule: "@request.auth.id != ''",
                deleteRule: "@request.auth.id != ''",
                fields: [
                    { name: "project_id", type: "text", required: true },
                    { name: "provider", type: "select", values: ["gemini", "grok", "openai"], required: true },
                    { name: "encrypted_api_key", type: "text" },
                    { name: "enabled", type: "bool" },
                    { name: "default_model", type: "text" },
                    { name: "options_json", type: "json" }
                ]
            });
            app.save(aiProviders);
        }
    } catch (err) {
        console.log("[Migration] Info ai_providers collection:", err);
    }
}, (app) => {
    // rollback opcional
});
