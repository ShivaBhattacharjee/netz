import { ImportQueue } from "@/components/import-queue";
import { PageHeader } from "@/components/common";
import { UploadButton } from "@/components/upload-dialog";

export default function ImportsPage() {
  return (
    <>
      <PageHeader title="Imports" meta="Supplier sheets and photos, processed in the background" actions={<UploadButton pageDrop />} />
      <ImportQueue />
    </>
  );
}
