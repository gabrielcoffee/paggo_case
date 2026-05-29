import { redirect } from "next/navigation";

// Dashboard lands on Day 4. For now the invoice list is the entry point.
export default function Home() {
  redirect("/invoices");
}
