// pb_hooks/main.pb.js
/// <reference path="../pb_data/types.d.ts" />

// Hook para quando um novo usuário se cadastra ou faz login via OAuth2 (Google)
onRecordCreate((e) => {
    e.next();
    
    // Se o usuário não tiver project_id associado, cria um projeto Trial e define role 'creator'
    if (e.record.collection().name === "users") {
        const role = e.record.get("role");
        const projectId = e.record.get("project_id");
        
        if (!role || role === "") {
            e.record.set("role", "creator");
        }
        
        if (!projectId || projectId === "") {
            try {
                const projects = $app.findCollectionByNameOrId("projects");
                const userName = e.record.get("name") || e.record.get("email").split("@")[0] || "Usuário";
                
                const project = new Record(projects);
                project.set("name", `Projeto de ${userName}`);
                project.set("plan", "trial");
                project.set("plan_status", "active");
                project.set("plan_starts_at", new Date().toISOString());
                
                // 30 dias de trial
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 30);
                project.set("plan_ends_at", trialEnd.toISOString());
                
                $app.save(project);
                
                e.record.set("project_id", project.id);
                $app.save(e.record);
            } catch (err) {
                console.error("[PocketBase Hook] Erro ao criar projeto inicial para usuário:", err);
            }
        }
    }
}, "users");

// Hook para OAuth2 logins existentes que possam não ter projeto vinculado ainda
onRecordAuthWithOAuth2Request((e) => {
    e.next();
    
    const user = e.record;
    if (user && user.collection().name === "users") {
        if (!user.get("role") || user.get("role") === "") {
            user.set("role", "creator");
        }
        
        if (!user.get("project_id") || user.get("project_id") === "") {
            try {
                const projects = $app.findCollectionByNameOrId("projects");
                const userName = user.get("name") || user.get("email").split("@")[0] || "Usuário";
                
                const project = new Record(projects);
                project.set("name", `Projeto de ${userName}`);
                project.set("plan", "trial");
                project.set("plan_status", "active");
                project.set("plan_starts_at", new Date().toISOString());
                
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 30);
                project.set("plan_ends_at", trialEnd.toISOString());
                
                $app.save(project);
                
                user.set("project_id", project.id);
                $app.save(user);
            } catch (err) {
                console.error("[PocketBase Hook] Erro ao vincular projeto em login OAuth2:", err);
            }
        }
    }
});
