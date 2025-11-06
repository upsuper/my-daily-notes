import { Editor, Plugin, EditorPosition, MarkdownView, WorkspaceLeaf } from 'obsidian';

export default class MyDailyNotes extends Plugin {
  private navigationElements = new Map<MarkdownView, HTMLElement>();

  async onload() {
    this.addCommand({
      id: 'insert-today',
      name: '插入今天',
      editorCallback: createInsertDateCallback(),
    });
    this.addCommand({
      id: 'insert-yesterday',
      name: '插入昨天',
      editorCallback: createInsertDateCallback({
        name: '昨天',
        updateDate: (date: Date) => {
          date.setDate(date.getDate() - 1);
        },
      }),
    });
    this.addCommand({
      id: 'insert-tomorrow',
      name: '插入明天',
      editorCallback: createInsertDateCallback({
        name: '明天',
        updateDate: (date: Date) => {
          date.setDate(date.getDate() + 1);
        },
      }),
    });
    this.addCommand({
      id: 'insert-date-picker',
      name: '插入日期（选择）',
      editorCallback: (editor: Editor) => {
        showDatePickerAtCursor(editor);
      },
    });

    // Add navigation links to daily notes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const view = leaf?.view;
        if (view && view instanceof MarkdownView) {
          this.updateDailyNoteNavigation(view);
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          this.updateDailyNoteNavigation(view);
        }
      })
    );
    // Update navigation for currently active leaf
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      this.updateDailyNoteNavigation(activeView);
    }
  }

  onunload() {
    // Clean up all navigation elements
    this.navigationElements.forEach((element) => element.remove());
    this.navigationElements.clear();
  }

  private updateDailyNoteNavigation(view: MarkdownView) {
    // Remove existing navigation element for this leaf
    const existingElement = this.navigationElements.get(view);
    if (existingElement) {
      existingElement.remove();
      this.navigationElements.delete(view);
    }

    const file = view.file;
    if (!file) return;

    // Check if this is a daily note (YYYY-MM-DD format)
    const dateMatch = file.basename.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return;

    const [, year, month, day] = dateMatch;
    const currentDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Create navigation element
    const navElement = this.createNavigationElement(currentDate);
    
    // Insert at the top of the editor
    const contentEl = view.contentEl;
    const editorEl = contentEl.querySelector('.cm-editor');
    if (editorEl) {
      editorEl.insertBefore(navElement, editorEl.firstChild);
      this.navigationElements.set(view, navElement);
    }
  }

  private createNavigationElement(currentDate: Date): HTMLElement {
    const container = document.createElement('div');
    container.addClass('daily-note-navigation');

    // Previous day
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = formatDate(prevDate);
    
    const prevLink = document.createElement('a');
    prevLink.href = prevDateStr;
    prevLink.textContent = `← ${prevDateStr}`;
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(prevDateStr, '');
    });

    // Next day
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatDate(nextDate);
    
    const nextLink = document.createElement('a');
    nextLink.href = nextDateStr;
    nextLink.textContent = `${nextDateStr} →`;
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(nextDateStr, '');
    });

    container.appendChild(prevLink);
    container.appendChild(nextLink);

    return container;
  }
}

function createInsertDateCallback(opts: {
  name?: string,
  updateDate?: (date: Date) => void,
} = {}): (editor: Editor) => void {
  const { name, updateDate } = opts;
  return (editor: Editor) => {
    const date = new Date();
    updateDate?.(date);
    const formattedDate = formatDate(date);
    editor.replaceSelection(`[[${formattedDate}${name ? `|${name}` : ''}]]`);
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showDatePickerAtCursor(editor: Editor) {
  const cursor = editor.getCursor();
  const coords = (editor as any).cm.coordsAtPos(editor.posToOffset(cursor));	
  if (!coords) {
    return;
  }

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.style.position = 'fixed';
  dateInput.style.left = `${coords.left}px`;
  dateInput.style.top = `${coords.top}px`;
  dateInput.style.zIndex = '1000';
  dateInput.style.opacity = '0';
  dateInput.style.pointerEvents = 'none';

  const onChange = () => {
    const selectedDate = dateInput.value;
    if (selectedDate) {
      editor.replaceSelection(`[[${selectedDate}]]`);
    }
    cleanup();
  };
  const onBlur = () => cleanup();

  const cleanup = () => {
    dateInput.removeEventListener('change', onChange);
    dateInput.removeEventListener('blur', onBlur);
    dateInput.remove();
  };

  dateInput.addEventListener('change', onChange);
  dateInput.addEventListener('blur', onBlur);

  document.body.appendChild(dateInput);
  dateInput.focus();
  try {
    dateInput.showPicker();
  } catch (e) {
    console.error('Failed to show date picker:', e);
    cleanup();
  }
}

