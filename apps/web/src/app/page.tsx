import { redirect } from "next/navigation";

export default function HomePage() {
  // Redirect to CEO workspace by default
  redirect("/ceo");
}
