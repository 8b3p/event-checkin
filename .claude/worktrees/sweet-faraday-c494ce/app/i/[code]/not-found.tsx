export default function InviteNotFound() {
  return (
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 text-center">
      <h1 className="display text-3xl text-foreground">هذه الدعوة غير صالحة</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        قد يكون الرابط غير صحيح، أو تم حذف الدعوة. تواصل مع من أرسلها إليك.
      </p>
    </main>
  );
}
