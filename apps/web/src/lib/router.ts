import { useEffect, useState } from "react";

export type Route =
  | { page: "library"; name?: string }
  | { page: "create" }
  | { page: "language" };

export function parseHash(hash: string): Route {
  const [page = "library", param] = hash.replace(/^#\/?/, "").split("/");
  switch (page) {
    case "create":
      return { page: "create" };
    case "language":
    // The vocabulary used to have a page of its own. It is part of the language
    // now, so an old bookmark lands where its contents went rather than 404ing.
    case "elements":
      return { page: "language" };
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
