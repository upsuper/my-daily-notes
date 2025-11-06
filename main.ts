import { Editor, Plugin, MarkdownView } from 'obsidian';

export default class MyDailyNotes extends Plugin {
  private navigationElements = new Map<MarkdownView, HTMLElement>();

  async onload() {
    this.addCommand({
      id: 'insert-today',
      name: '插入今天',
      editorCallback: createInsertDateCallback({
        getDate: () => new Date(),
      }),
    });
    this.addCommand({
      id: 'insert-yesterday',
      name: '插入昨天',
      editorCallback: createInsertDateCallback({
        name: '昨天',
        getDate: () => getDate(-1),
      }),
    });
    this.addCommand({
      id: 'insert-tomorrow',
      name: '插入明天',
      editorCallback: createInsertDateCallback({
        name: '明天',
        getDate: () => getDate(1),
      }),
    });
    this.addCommand({
      id: 'insert-day-before-yesterday',
      name: '插入前天',
      editorCallback: createInsertDateCallback({
        name: '前天',
        getDate: () => getDate(-2),
      }),
    });
    this.addCommand({
      id: 'insert-day-after-tomorrow',
      name: '插入后天',
      editorCallback: createInsertDateCallback({
        name: '后天',
        getDate: () => getDate(2),
      }),
    });
    this.addCommand({
      id: 'insert-date-picker',
      name: '插入日期（选择）',
      editorCallback: (editor: Editor) => {
        const cursor = editor.getCursor();
        const coords = (editor as any).cm.coordsAtPos(editor.posToOffset(cursor));	
        if (!coords) {
          return;
        }
        showDatePickerAtCursor(coords.left, coords.top, new Date(), (date) => {
          editor.replaceSelection(`[[${date}]]`);
        });
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

    // Check if this is a daily note (YYYY-MM-DD format)
    const dateMatch = view.file?.basename.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return;
    }

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
    container.addClass('my-daily-note-navigation');

    // Previous day
    const prevDateStr = formatDate(getDate(-1, currentDate));
    const prevLink = document.createElement('a');
    prevLink.addClass('my-daily-note-navigation-link');
    prevLink.href = prevDateStr;
    prevLink.textContent = `← ${prevDateStr}`;
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(prevDateStr, '');
    });

    // Date picker button
    const datePickerBtn = document.createElement('button');
    datePickerBtn.textContent = '跳到';
    datePickerBtn.addClass('my-daily-note-date-picker-btn');
    datePickerBtn.addClass('clickable-icon');
    datePickerBtn.addEventListener('click', () => {
      const { left, top } = datePickerBtn.getBoundingClientRect();
      showDatePickerAtCursor(left, top, currentDate, (date) => {
        this.app.workspace.openLinkText(date, '');
      });
    });

    // Next day
    const nextDateStr = formatDate(getDate(1, currentDate));
    const nextLink = document.createElement('a');
    nextLink.addClass('my-daily-note-navigation-link');
    nextLink.href = nextDateStr;
    nextLink.textContent = `${nextDateStr} →`;
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(nextDateStr, '');
    });

    container.appendChild(prevLink);
    container.appendChild(datePickerBtn);
    container.appendChild(nextLink);

    return container;
  }
}

function getDate(offset: number, date?: Date): Date {
  date ??= new Date();
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + offset);
  return newDate;
}

function createInsertDateCallback(opts: {
  name?: string,
  getDate: () => Date,
}): (editor: Editor) => void {
  const { name, getDate } = opts;
  return (editor: Editor) => {
    const formattedDate = formatDate(getDate());
    editor.replaceSelection(`[[${formattedDate}${name ? `|${name}` : ''}]]`);
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showDatePickerAtCursor(
  left: number,
  top: number,
  date: Date,
  onSelect: (date: string) => void,
) {
  const dateInput = document.createElement('input');
  dateInput.addClass('my-daily-notes-hidden-date-picker');
  dateInput.type = 'date';
  dateInput.style.left = `${left}px`;
  dateInput.style.top = `${top}px`;
  dateInput.value = formatDate(date);

  const onChange = () => {
    const selectedDate = dateInput.value;
    if (selectedDate) {
      onSelect(selectedDate);
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
