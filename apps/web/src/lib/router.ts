import { useEffect, useState } from "react";

export type Route =
  | { page: "library"; name?: string }
  | { page: "create" }
  | { page: "language" }
  | { page: "elements" };

export function parseHash(hash: string): Route {
  const [page = "library", param] = hash.replace(/^#\/?/, "").split("/");
  switch (page) {
    case "create":
      return { page: "create" };
    case "language":
      return { page: "language" };
    case "elements":
      return { page: "elements" };
    default:
      return param ? { page: "library", name: decodeURIComponent(param) } : { page: "library" };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
}
