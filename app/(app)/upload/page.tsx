import { MixedUploadForm } from "@/components/upload/mixed-upload-form";

export default function UploadPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Start a transfer
        </h1>
        <p className="max-w-md text-muted-foreground">
          Upload from one device, open the link on any other. No account,
          messaging apps, or USB drives required.
        </p>
      </div>

      <MixedUploadForm />
    </div>
  );
}
