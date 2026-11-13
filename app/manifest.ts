import type { MetadataRoute } from "next";
import { MANIFEST } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return MANIFEST;
}
