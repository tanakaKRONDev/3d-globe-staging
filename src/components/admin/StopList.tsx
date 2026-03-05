import { useCallback, memo } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react'

export interface StopRow {
  id: string
  order: number
  city: string
  country: string
  venue: string
  address: string
}

export interface StopListProps {
  stops: StopRow[]
  sortableIds: string[] | null
  selectedStopId: string | null
  editingNew: boolean
  getCountryName: (code: string) => string | undefined
  onSelectStop: (stop: StopRow) => void
  onLocalReorder: (reorderedStops: StopRow[]) => void
  onMoveUp: (stop: StopRow) => void
  onMoveDown: (stop: StopRow) => void
  reordering: boolean
}

type StopRowProps = {
  stop: StopRow
  selectedStopId: string | null
  editingNew: boolean
  getCountryName: (code: string) => string | undefined
  onSelectStop: (stop: StopRow) => void
  onMoveUp: (stop: StopRow) => void
  onMoveDown: (stop: StopRow) => void
  reordering: boolean
}

const SortableStopRow = memo(function SortableStopRow({
  stop,
  selectedStopId,
  editingNew,
  getCountryName,
  onSelectStop,
  onMoveUp,
  onMoveDown,
  reordering,
}: StopRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isSelected = selectedStopId === stop.id && !editingNew

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectStop(stop)}
      className={
        isSelected
          ? 'admin-page__row admin-page__row--selected'
          : isDragging
            ? 'admin-page__row admin-page__row--dragging'
            : 'admin-page__row'
      }
    >
      <td className="admin-page__cell-reorder" onClick={(e) => e.stopPropagation()}>
        <div className="admin-page__reorder-cell">
          <span
            className="admin-page__drag-handle"
            title="Drag to reorder"
            {...listeners}
            {...attributes}
          >
            <GripVertical size={18} />
          </span>
          <div className="admin-page__reorder-btns">
            <button
              type="button"
              className="admin-page__reorder-btn"
              onClick={(e) => {
                e.stopPropagation()
                onMoveUp(stop)
              }}
              disabled={reordering}
              title="Move up"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="admin-page__reorder-btn"
              onClick={(e) => {
                e.stopPropagation()
                onMoveDown(stop)
              }}
              disabled={reordering}
              title="Move down"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </td>
      <td>{stop.order}</td>
      <td>{stop.city}</td>
      <td>{getCountryName(stop.country) || stop.country}</td>
      <td>{stop.venue}</td>
      <td className="admin-page__cell-address">{stop.address}</td>
    </tr>
  )
})

const PlainStopRow = memo(function PlainStopRow({
  stop,
  selectedStopId,
  editingNew,
  getCountryName,
  onSelectStop,
  onMoveUp,
  onMoveDown,
  reordering,
}: StopRowProps) {
  const isSelected = selectedStopId === stop.id && !editingNew

  return (
    <tr
      onClick={() => onSelectStop(stop)}
      className={isSelected ? 'admin-page__row admin-page__row--selected' : 'admin-page__row'}
    >
      <td className="admin-page__cell-reorder" onClick={(e) => e.stopPropagation()}>
        <div className="admin-page__reorder-btns">
          <button
            type="button"
            className="admin-page__reorder-btn"
            onClick={() => onMoveUp(stop)}
            disabled={reordering}
            title="Move up"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="admin-page__reorder-btn"
            onClick={() => onMoveDown(stop)}
            disabled={reordering}
            title="Move down"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </td>
      <td>{stop.order}</td>
      <td>{stop.city}</td>
      <td>{getCountryName(stop.country) || stop.country}</td>
      <td>{stop.venue}</td>
      <td className="admin-page__cell-address">{stop.address}</td>
    </tr>
  )
})

export function StopList({
  stops,
  sortableIds,
  selectedStopId,
  editingNew,
  getCountryName,
  onSelectStop,
  onLocalReorder,
  onMoveUp,
  onMoveDown,
  reordering,
}: StopListProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 8 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over == null || active.id === over.id) return
      const oldIndex = stops.findIndex((s) => s.id === active.id)
      const newIndex = stops.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(stops, oldIndex, newIndex)
      const withNewOrder = reordered.map((s, i) => ({ ...s, order: i }))
      onLocalReorder(withNewOrder)
    },
    [stops, onLocalReorder]
  )

  const RowComponent = sortableIds != null ? SortableStopRow : PlainStopRow

  const tableBody = (
    <tbody>
      {stops.map((stop) => (
        <RowComponent
          key={stop.id}
          stop={stop}
          selectedStopId={selectedStopId}
          editingNew={editingNew}
          getCountryName={getCountryName}
          onSelectStop={onSelectStop}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          reordering={reordering}
        />
      ))}
    </tbody>
  )

  if (sortableIds != null) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <table className="admin-page__table">
            <thead>
              <tr>
                <th className="admin-page__cell-reorder"> </th>
                <th>Order</th>
                <th>City</th>
                <th>Country</th>
                <th>Venue</th>
                <th>Address</th>
              </tr>
            </thead>
            {tableBody}
          </table>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <table className="admin-page__table">
      <thead>
        <tr>
          <th className="admin-page__cell-reorder"> </th>
          <th>Order</th>
          <th>City</th>
          <th>Country</th>
          <th>Venue</th>
          <th>Address</th>
        </tr>
      </thead>
      {tableBody}
    </table>
  )
}
