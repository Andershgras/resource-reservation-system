import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../test/axe'
import { Alert } from './Alert'
import { Badge } from './Badge'
import { Button } from './Button'
import { Card } from './Card'
import { Checkbox, Field, Input, Select } from './Field'
import { PageHeader } from './PageHeader'
import { EmptyState, LoadingState } from './States'

describe('Button', () => {
  it('does not submit a form unless asked to', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button>Cancel</Button>
        <Button type="submit" variant="primary">Save</Button>
      </form>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('can be used with the keyboard', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Edit</Button>)

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations in any variant', async () => {
    const { container } = render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost" size="sm">Ghost</Button>
        <Button variant="danger" disabled>Danger</Button>
      </>,
    )

    await expectNoAxeViolations(container)
  })
})

describe('Field', () => {
  function NameField({ error, hint }: { error?: string; hint?: string }) {
    return (
      <Field label="Name" error={error} hint={hint}>
        {(props) => <Input {...props} defaultValue="" />}
      </Field>
    )
  }

  it('labels its control', () => {
    render(<NameField />)

    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveAttribute('aria-describedby')
  })

  it('describes the control with its hint and error, and marks it invalid', () => {
    render(<NameField hint="As shown to users." error="Enter a resource name." />)

    const input = screen.getByRole('textbox', { name: 'Name' })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('As shown to users. Enter a resource name.')
  })

  it('marks optional fields in the label', () => {
    render(
      <Field label="Location" optional>
        {(props) => <Input {...props} />}
      </Field>,
    )

    expect(screen.getByRole('textbox', { name: 'Location (optional)' })).toBeInTheDocument()
  })

  it('has no accessibility violations with inputs, selects, checkboxes and errors', async () => {
    const { container } = render(
      <form>
        <NameField hint="As shown to users." error="Enter a resource name." />
        <Field label="Weekday">
          {(props) => (
            <Select {...props} defaultValue="">
              <option value="">Select weekday</option>
              <option value="1">Monday</option>
            </Select>
          )}
        </Field>
        <Field label="Start time" error="Enter a start time.">
          {(props) => <Input {...props} type="datetime-local" />}
        </Field>
        <Checkbox label="Active" defaultChecked />
      </form>,
    )

    await expectNoAxeViolations(container)
  })
})

describe('Card', () => {
  it('is a region named by its heading', () => {
    render(<Card title="Resources" actions={<Badge>3</Badge>}><p>Content</p></Card>)

    expect(screen.getByRole('region', { name: 'Resources' })).toContainElement(screen.getByText('Content'))
    expect(screen.getByRole('heading', { level: 2, name: 'Resources' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <PageHeader title="Resources" description="Manage what can be booked." />
        <Card title="Resources" description="Everything users can book." actions={<Button>Add</Button>}>
          <EmptyState title="No resources yet" description="Create one to get started." />
        </Card>
        <Card title="Nested" headingLevel={3}>
          <LoadingState>Loading resources...</LoadingState>
        </Card>
      </main>,
    )

    await expectNoAxeViolations(container)
  })
})

describe('Badge', () => {
  it('can be read with a fuller label than it shows', () => {
    render(<Badge label="3 resources">3</Badge>)

    expect(screen.getByText('3 resources')).toHaveClass('visually-hidden')
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Alert', () => {
  it('announces errors straight away and other messages politely', () => {
    render(
      <>
        <Alert tone="danger">Resource is already reserved.</Alert>
        <Alert tone="success">Resource created.</Alert>
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Resource is already reserved.')
    expect(screen.getByRole('status')).toHaveTextContent('Resource created.')
  })

  it('has no accessibility violations in any tone', async () => {
    const { container } = render(
      <>
        <Alert tone="info" title="Heads up">Times are in Copenhagen time.</Alert>
        <Alert tone="success">Saved.</Alert>
        <Alert tone="warning">Check the dates.</Alert>
        <Alert tone="danger">Something went wrong.</Alert>
        <Badge tone="success">Active</Badge>
        <Badge tone="danger">Cancelled</Badge>
      </>,
    )

    await expectNoAxeViolations(container)
  })
})
