import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recordkar",
    short_name: "Recordkar",
    description: "Know where your money stands.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f6",
    theme_color: "#0F6E56",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
