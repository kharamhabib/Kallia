import PocketBase from "pocketbase";

export const getPocketBaseUrl = (): string => {
  // 1. Variável de ambiente (Vite / Build)
  if (import.meta.env.VITE_POCKETBASE_URL) {
    return import.meta.env.VITE_POCKETBASE_URL;
  }

  // 2. Override configurado em tempo de execução via LocalStorage
  const saved = localStorage.getItem("kallia.pocketbase_url");
  if (saved) return saved;

  const host = window.location.hostname;
  const protocol = window.location.protocol;

  // 3. Ambiente Local
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:8090`;
  }

  // 4. Resolução dinâmica genérica de subdomínio:
  // Se estiver em app.dominio.com -> busca em pb.dominio.com ou pocketdb.dominio.com
  const parts = host.split(".");
  if (parts.length > 2) {
    const rootDomain = parts.slice(1).join(".");
    // Se o subdomínio atual começar com 'call' ou 'app', tenta o prefixo pb/pocketdb
    return `${protocol}//pocketdb.${rootDomain}`;
  }

  return `${protocol}//pb.${host}`;
};

export const pb = new PocketBase(getPocketBaseUrl());
