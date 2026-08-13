import { DoctorsDirectory } from "@/components/doctors/doctors-directory";
import { getServerDoctorsPage } from "@/lib/server-public-doctors";


export const dynamic = "force-dynamic";

export default async function DoctorsPage() {
  const initialPage = await getServerDoctorsPage();
  return <DoctorsDirectory initialPage={initialPage} />;
}
