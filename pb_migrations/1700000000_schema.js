/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    // 1. Projects collection
    const projects = new Collection({
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

    // 2. Extend users collection
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({
        name: "role",
        type: "select",
        values: ["appadmin", "creator", "normal"],
        required: true
    }));
    users.fields.add(new Field({
        name: "project_id",
        type: "relation",
        collectionId: projects.id,
        cascadeDelete: false
    }));
    app.save(users);

    // 3. Sessions collection (Conexões WhatsApp)
    const sessions = new Collection({
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
            { name: "project_id", type: "relation", collectionId: projects.id, cascadeDelete: true, required: true },
            { name: "api_key", type: "text" }
        ]
    });
    app.save(sessions);

    // 4. Agents collection (Personas Especialistas)
    const agents = new Collection({
        name: "agents",
        type: "base",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
            { name: "session_id", type: "relation", collectionId: sessions.id, cascadeDelete: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "description", type: "text" },
            { name: "ai_config", type: "json", required: true },
            { name: "inbound", type: "bool" },
            { name: "outbound", type: "bool" }
        ]
    });
    app.save(agents);

    // 5. Contacts (CRM) collection
    const contacts = new Collection({
        name: "contacts",
        type: "base",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
            { name: "session_id", type: "relation", collectionId: sessions.id, cascadeDelete: true, required: true },
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

    // 6. Call History collection
    const callHistory = new Collection({
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

    // 7. Call Transcripts collection
    const callTranscripts = new Collection({
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

    // 8. AI Providers collection
    const aiProviders = new Collection({
        name: "ai_providers",
        type: "base",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
            { name: "project_id", type: "relation", collectionId: projects.id, cascadeDelete: true, required: true },
            { name: "provider", type: "select", values: ["gemini", "grok", "openai"], required: true },
            { name: "encrypted_api_key", type: "text" },
            { name: "enabled", type: "bool" },
            { name: "default_model", type: "text" },
            { name: "options_json", type: "json" }
        ]
    });
    app.save(aiProviders);

    // 9. Call Ratings (NPS) collection
    const callRatings = new Collection({
        name: "call_ratings",
        type: "base",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
            { name: "session_id", type: "text", required: true },
            { name: "call_id", type: "text", required: true },
            { name: "phone", type: "text", required: true },
            { name: "score", type: "number", required: true },
            { name: "comment", type: "text" }
        ]
    });
    app.save(callRatings);

    // 10. Sent Polls collection
    const sentPolls = new Collection({
        name: "sent_polls",
        type: "base",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
            { name: "session_id", type: "text", required: true },
            { name: "poll_id", type: "text", required: true },
            { name: "option_hash", type: "text", required: true },
            { name: "option_text", type: "text", required: true }
        ]
    });
    app.save(sentPolls);
});
