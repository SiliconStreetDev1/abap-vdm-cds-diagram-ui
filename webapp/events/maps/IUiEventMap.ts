export interface IUiEventMap {
    "ui:openDialog": { viewId?: string; dialogType: string };
    "ui:closeDialog": { viewId?: string; dialogType: string };
    "ui:restoreSelectedNodes": { viewId?: string };
    "ui:showAllHiddenNodes": { viewId?: string };
}
