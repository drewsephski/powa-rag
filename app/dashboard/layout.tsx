import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { Sidebar } from "@/components/layout/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="flex h-svh">
      <Sidebar agencyName={session.agencyName} />
      <main className="flex flex-1 flex-col">
        <div className="flex w-full flex-1 flex-col px-6">
          {children}
        </div>
      </main>
    </div>
  )
}
