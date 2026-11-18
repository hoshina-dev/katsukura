import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

type LocationState = { pathname: string; search: string };

const LocationContext = createContext<LocationState | null>(null);
const RefreshContext = createContext<{ token: number; refresh: () => void } | null>(
  null,
);

function readLocation(): LocationState {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation);
  const [token, setToken] = useState(0);
  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const refresh = useCallback(() => setToken((current) => current + 1), []);
  return (
    <LocationContext.Provider value={location}>
      <RefreshContext.Provider value={{ token, refresh }}>
        {children}
      </RefreshContext.Provider>
    </LocationContext.Provider>
  );
}

function useLocation() {
  const location = useContext(LocationContext);
  if (!location) throw new Error("NavigationProvider is missing");
  return location;
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRefreshToken() {
  const refresh = useContext(RefreshContext);
  if (!refresh) throw new Error("NavigationProvider is missing");
  return refresh.token;
}

// replace keeps the current history entry, so Back skips the intermediate URL.
export function navigate(href: string, replace = false) {
  const url = new URL(href, window.location.href);
  const next = url.pathname + url.search + url.hash;
  const current =
    window.location.pathname + window.location.search + window.location.hash;
  if (next === current) return;
  if (replace) history.replaceState(null, "", next);
  else history.pushState(null, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRouter() {
  const refreshState = useContext(RefreshContext);
  const refresh = refreshState?.refresh ?? (() => {});
  return {
    push: (href: string, _options?: { scroll?: boolean }) => navigate(href),
    replace: (href: string, _options?: { scroll?: boolean }) =>
      navigate(href, true),
    refresh,
  };
}

export const Link = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function Link({ href, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        if (typeof href !== "string" || !href.startsWith("/")) return;
        event.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
});
