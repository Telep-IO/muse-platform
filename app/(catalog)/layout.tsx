import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="shell">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </>
  );
}
