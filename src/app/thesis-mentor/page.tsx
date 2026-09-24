import { redirect } from "next/navigation";

/**
 * Thesis Mentor UI removed in Milestone 12 (Product Owner direction).
 * Route kept as a safe redirect so old links do not 404.
 */
export default function ThesisMentorPage() {
  redirect("/");
}
