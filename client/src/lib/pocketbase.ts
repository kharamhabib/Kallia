import PocketBase from "pocketbase";

export const getPocketBaseUrl = (): string => {
  if (import.meta.env.VITE_POCKETBASE_URL) {
    return import.meta.env.VITE_POCKETBASE_URL;
  }
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:8090`;
  }
  const parts = host.split(".");
  if (parts.length > 2 && parts[0] === "app") {
    return `${window.location.protocol}//pb.${parts.slice(1).join(".")}`;
  }
  return `${window.location.protocol}//${host}:8090`;
};

export const pb = new PocketBase(getPocketBaseUrl());
