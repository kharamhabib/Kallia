/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    // 1. Criar coleção 'workspaces'
    try {
        let workspaces = null;
        try {
            workspaces = app.findCollectionByNameOrId("workspaces");
        } catch (_) {}

        if (!workspaces) {
            workspaces = new Collection({
                name: "workspaces",
                type: "base",
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
                fields: [
                    { name: "name", type: "text", required: true },
                    { name: "plan", type: "select", values: ["trial", "basic", "pro", "expert", "enterprise"], required: true },
                    { name: "plan_status", type: "select", values: ["active", "inactive", "canceled", "past_due"], required: true },
                    { name: "max_connections", type: "number" },
                    { name: "max_concurrent_calls", type: "number" },
                    { name: "max_agents", type: "number" },
                    { name: "plan_starts_at", type: "date" },
                    { name: "plan_ends_at", type: "date" }
                ]
            });
            app.save(workspaces);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info workspaces collection:", err);
    }

    // 2. Criar coleção 'workspace_members'
    try {
        let members = null;
        try {
            members = app.findCollectionByNameOrId("workspace_members");
        } catch (_) {}

        if (!members) {
            members = new Collection({
                name: "workspace_members",
                type: "base",
                listRule: "",
                viewRule: "",
                createRule: "",
                updateRule: "",
                deleteRule: "",
                fields: [
                    { name: "workspace_id", type: "text", required: true },
                    { name: "user_id", type: "text", required: true },
                    { name: "role", type: "select", values: ["owner", "admin", "agent", "viewer"], required: true }
                ]
            });
            app.save(members);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info workspace_members collection:", err);
    }

    // 3. Atualizar coleção 'users' com default_workspace_id
    try {
        const users = app.findCollectionByNameOrId("users");
        if (users && users.fields) {
            try {
                users.fields.add(new Field({
                    name: "default_workspace_id",
                    type: "text"
                }));
                app.save(users);
            } catch (_) {}
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info users default_workspace_id:", err);
    }

    // 4. Atualizar coleção 'sessions' com workspace_id, default_agent_id, phone_number, status
    try {
        const sessions = app.findCollectionByNameOrId("sessions");
        if (sessions && sessions.fields) {
            try { sessions.fields.add(new Field({ name: "workspace_id", type: "text" })); } catch (_) {}
            try { sessions.fields.add(new Field({ name: "default_agent_id", type: "text" })); } catch (_) {}
            try { sessions.fields.add(new Field({ name: "phone_number", type: "text" })); } catch (_) {}
            try { sessions.fields.add(new Field({ name: "status", type: "text" })); } catch (_) {}
            app.save(sessions);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info sessions fields:", err);
    }

    // 5. Atualizar coleção 'agents' com workspace_id
    try {
        const agents = app.findCollectionByNameOrId("agents");
        if (agents && agents.fields) {
            try { agents.fields.add(new Field({ name: "workspace_id", type: "text" })); } catch (_) {}
            app.save(agents);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info agents workspace_id:", err);
    }

    // 6. Atualizar 'ai_providers' com workspace_id
    try {
        const aiProviders = app.findCollectionByNameOrId("ai_providers");
        if (aiProviders && aiProviders.fields) {
            try { aiProviders.fields.add(new Field({ name: "workspace_id", type: "text" })); } catch (_) {}
            app.save(aiProviders);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info ai_providers workspace_id:", err);
    }

    // 7. Atualizar 'contacts' com workspace_id
    try {
        const contacts = app.findCollectionByNameOrId("contacts");
        if (contacts && contacts.fields) {
            try { contacts.fields.add(new Field({ name: "workspace_id", type: "text" })); } catch (_) {}
            app.save(contacts);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info contacts workspace_id:", err);
    }

    // 8. Atualizar 'call_history' com workspace_id
    try {
        const callHistory = app.findCollectionByNameOrId("call_history");
        if (callHistory && callHistory.fields) {
            try { callHistory.fields.add(new Field({ name: "workspace_id", type: "text" })); } catch (_) {}
            app.save(callHistory);
        }
    } catch (err) {
        console.log("[Migration 1710000000] Info call_history workspace_id:", err);
    }
});
