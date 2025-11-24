import { Editor, Plugin, MarkdownView, MarkdownFileInfo } from 'obsidian';

export default class MyDailyNotes extends Plugin {
  private navigationElements = new Map<MarkdownView, HTMLElement>();

  async onload() {
    this.addCommand({
      id: 'insert-today',
      name: '插入今天',
      editorCallback: createInsertDateCallback({}),
    });
    this.addCommand({
      id: 'insert-yesterday',
      name: '插入昨天',
      editorCallback: createInsertDateCallback({
        name: '昨天',
        offset: -1,
      }),
    });
    this.addCommand({
      id: 'insert-tomorrow',
      name: '插入明天',
      editorCallback: createInsertDateCallback({
        name: '明天',
        offset: 1,
      }),
    });
    this.addCommand({
      id: 'insert-day-before-yesterday',
      name: '插入前天',
      editorCallback: createInsertDateCallback({
        name: '前天',
        offset: -2,
      }),
    });
    this.addCommand({
      id: 'insert-day-after-tomorrow',
      name: '插入后天',
      editorCallback: createInsertDateCallback({
        name: '后天',
        offset: 2,
      }),
    });
    this.addCommand({
      id: 'insert-date-picker',
      name: '插入日期（选择）',
      editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        const cursor = editor.getCursor();
        const coords = (editor as any).cm.coordsAtPos(editor.posToOffset(cursor));	
        if (!coords) {
          return;
        }
        showDatePickerAtCursor(coords.left, coords.top, new Date(), (date) => {
          const fileDate = dateForView(view);
          let linkText = '';
          if (fileDate) {
            const [year, month, day] = date.split('-').map(s => parseInt(s));
            const selectedDate = new Date(year, month - 1, day);
            const relativeDay = getRelativeDay(selectedDate, {
              base: fileDate,
              style: 'spoken',
            });
            linkText = relativeDay ? `|${relativeDay}` : '';
          }
          editor.replaceSelection(`[[${date}${linkText}]]`);
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

    const contentEl = view.contentEl;
    const editorEl = contentEl.querySelector('.cm-editor');
    if (!editorEl) {
      return;
    }

    const currentDate = dateForView(view);
    if (!currentDate) {
      const inlineTitle = editorEl.querySelector('.inline-title');
      if (inlineTitle) {
        inlineTitle.removeAttribute('data-day');
      }
      return;
    }

    const navElement = this.createNavigationElement(currentDate);
    editorEl.insertBefore(navElement, editorEl.firstChild);
    this.navigationElements.set(view, navElement);

    const inlineTitle = editorEl.querySelector('.inline-title');
    if (inlineTitle) {
      const relativeDay = getRelativeDay(currentDate);
      if (relativeDay) {
        inlineTitle.setAttribute('data-day', relativeDay);
      } else {
        inlineTitle.removeAttribute('data-day');
      }
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
    if (!this.app.metadataCache.getFirstLinkpathDest(prevDateStr, '')) {
      prevLink.addClass('is-unresolved');
    }
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
    if (!this.app.metadataCache.getFirstLinkpathDest(nextDateStr, '')) {
      nextLink.addClass('is-unresolved');
    }
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

function getRelativeDay(date: Date, opts?: {
  base?: Date,
  style?: 'spoken' | 'written',
}): string | undefined {
  const today = opts?.base ?? new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  // Check for special days
  if (diffDays === 0) {
    return '今天';
  }
  if (diffDays === -1) {
    return '昨天';
  }
  if (diffDays === -2) {
    return '前天';
  }
  if (diffDays === 1) {
    return '明天';
  }
  if (diffDays === 2) {
    return '后天';
  }

  // Get week information
  const getWeekInfo = (date: Date) => {
    const day = date.getDay();
    const monday = new Date(date);
    // Adjust to Monday (day 1). Sunday is 0, so we need special handling
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(date.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return { monday, weekday: day === 0 ? 7 : day };
  };

  const todayWeek = getWeekInfo(today);
  const targetWeek = getWeekInfo(targetDate);
  const weekDiff = Math.round(
    (targetWeek.monday.getTime() - todayWeek.monday.getTime())
      / (1000 * 60 * 60 * 24 * 7),
  );
  const weekdayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const weekdayName = weekdayNames[targetWeek.weekday - 1];
  if (weekDiff === 0) {
    if (opts?.style === 'spoken') {
      return `这周${weekdayName}`;
    } else {
      return `本周${weekdayName}`;
    }
  }
  if (weekDiff === -1) {
    return `上周${weekdayName}`;
  }
  if (weekDiff === 1) {
    return `下周${weekdayName}`;
  }
}

function createInsertDateCallback(opts: {
  name?: string,
  offset?: number,
}): (editor: Editor, view: MarkdownView | MarkdownFileInfo) => void {
  const { name, offset } = opts;
  return (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
    const fileDate = dateForView(view);
    let targetDate: Date;
    if (fileDate && offset != null) {
      targetDate = getDate(offset, fileDate);
    } else if (offset != null) {
      targetDate = getDate(offset);
    } else {
      targetDate = new Date();
    }
    const formattedDate = formatDate(targetDate);
    const linkText = fileDate && name ? `|${name}` : '';
    editor.replaceSelection(`[[${formattedDate}${linkText}]]`);
  }
}

function dateForView(view: MarkdownView | MarkdownFileInfo): Date | undefined {
  const file = view.file;
  const dateMatch = file?.basename.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
