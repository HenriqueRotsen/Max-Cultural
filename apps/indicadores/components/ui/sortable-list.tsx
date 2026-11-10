"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Handle = { alca: ReactNode; arrastando: boolean };

/**
 * Lista que se reordena arrastando pela alça (mouse, toque ou teclado: espaço
 * pega, setas movem, espaço solta). A nova ordem aparece na hora; `onMover`
 * grava (id e a posição nova, 0 = primeiro).
 */
export function SortableList<T extends { id: string }>({
  itens,
  onMover,
  disabled,
  grade,
  className,
  itemClassName,
  rotulo,
  children,
}: {
  itens: T[];
  onMover: (id: string, para: number) => void;
  disabled?: boolean;
  /** Itens em grade (fotos) em vez de lista. */
  grade?: boolean;
  className?: string;
  itemClassName?: string;
  /** Nome do item para leitores de tela ("Arrastar <rótulo>"). */
  rotulo: (item: T) => string;
  children: (item: T, h: Handle) => ReactNode;
}) {
  // Ordem local enquanto o servidor grava; volta a seguir a prop quando ela muda.
  const [origem, setOrigem] = useState(itens);
  const [ordem, setOrdem] = useState(itens);
  if (origem !== itens) {
    setOrigem(itens);
    setOrdem(itens);
  }
  // Id estável entre servidor e navegador (sem ele, o dnd-kit gera ids diferentes na hidratação).
  const id = useId();
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function soltar(e: DragEndEvent) {
    const de = ordem.findIndex((x) => x.id === e.active.id);
    const para = e.over ? ordem.findIndex((x) => x.id === e.over!.id) : -1;
    if (de < 0 || para < 0 || de === para) return;
    setOrdem(arrayMove(ordem, de, para));
    onMover(String(e.active.id), para);
  }

  return (
    <DndContext id={id} sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltar}>
      <SortableContext items={ordem.map((x) => x.id)} strategy={grade ? rectSortingStrategy : verticalListSortingStrategy}>
        <ul className={className}>
          {ordem.map((item) => (
            <Item key={item.id} id={item.id} disabled={disabled} rotulo={rotulo(item)} className={itemClassName}>
              {(h) => children(item, h)}
            </Item>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Item({
  id,
  disabled,
  rotulo,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  rotulo: string;
  className?: string;
  children: (h: Handle) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const alca = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Arrastar ${rotulo}`}
      title="Arraste para mudar a ordem"
      className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <li ref={setNodeRef} style={style} className={cn(className, isDragging && "relative z-10 rounded-xl bg-white shadow-lg ring-1 ring-brand/20")}>
      {children({ alca, arrastando: isDragging })}
    </li>
  );
}
