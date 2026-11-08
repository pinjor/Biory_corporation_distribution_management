import * as React from "react";

const DRAWER_MAX = 1023;
const TABLET_MAX = 1279;

function useMediaMax(max: number) {
  const query = `(max-width: ${max}px)`;
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phones and tablet portrait: the menu opens as a full drawer. */
export function useIsMobile() {
  return useMediaMax(DRAWER_MAX);
}

/** Tablet landscape: keep the menu expanded so every submenu stays readable. */
export function useIsTablet() {
  const narrow = useMediaMax(DRAWER_MAX);
  const tablet = useMediaMax(TABLET_MAX);
  return tablet && !narrow;
}
