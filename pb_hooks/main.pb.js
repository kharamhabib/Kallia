// pb_hooks/main.pb.js
/// <reference path="../pb_data/types.d.ts" />

function ensureUserWorkspace(user) {
    if (!user || user.collection().name !== "users") return;

    const role = user.get("role");
    if (!role || role === "") {
        user.set("role", "creator");
    }

    const defaultWorkspaceId = user.get("default_workspace_id");
    if (!defaultWorkspaceId || defaultWorkspaceId === "") {
        try {
            const workspaces = $app.findCollectionByNameOrId("workspaces");
            const members = $app.findCollectionByNameOrId("workspace_members");
            const userName = user.get("name") || user.get("email").split("@")[0] || "Usuário";

            const ws = new Record(workspaces);
            ws.set("name", `Workspace de ${userName}`);
            ws.set("plan", "trial");
            ws.set("plan_status", "active");
            ws.set("max_connections", 1);
            ws.set("max_concurrent_calls", 1);
            ws.set("max_agents", 2);
            ws.set("plan_starts_at", new Date().toISOString());

            // 30 dias de trial
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 30);
            ws.set("plan_ends_at", trialEnd.toISOString());

            $app.save(ws);

            // Criar vínculo de membro como 'owner'
            const member = new Record(members);
            member.set("workspace_id", ws.id);
            member.set("user_id", user.id);
            member.set("role", "owner");
            $app.save(member);

            user.set("default_workspace_id", ws.id);
            $app.save(user);
        } catch (err) {
            console.error("[PocketBase Hook] Erro ao criar workspace inicial para usuário:", err);
        }
    }
}

// Hook para quando um novo usuário se cadastra
onRecordCreate((e) => {
    e.next();
    ensureUserWorkspace(e.record);
}, "users");

// Hook para OAuth2 logins
onRecordAuthWithOAuth2Request((e) => {
    e.next();
    ensureUserWorkspace(e.record);
});
