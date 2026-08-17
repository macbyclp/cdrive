/**
 * OnlyOffice DocsAPI'nin istemci tarafı (tarayıcı) tipleri — hem tam sayfa
 * editör rotası (src/app/office/[id]/page.tsx) hem de popup diyaloğu
 * (src/components/OfficeEditorDialog.tsx) aynı `Window.DocsAPI` global'ini
 * genişlettiği için, çakışan tip tanımlarını önlemek üzere tek yerde toplandı.
 */
export type DocEditorInstance = { destroyEditor?: () => void };

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => DocEditorInstance };
  }
}
