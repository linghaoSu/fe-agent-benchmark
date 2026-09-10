import React from "/vendor/react.js";

export function useMediaQuery(query, onChange) {
  React.useEffect(() => {
    const media = window.matchMedia(query);
    const handler = (event) => onChange(event.matches);
    handler(media);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [query]);
}
