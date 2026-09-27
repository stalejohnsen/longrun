import type { Metadata } from 'next'
import Link from 'next/link'
import { createComponentAction } from '../actions'
import { ComponentForm } from '../component-form'

export const metadata: Metadata = { title: 'Register component – Longrun' }

export default function NewComponentPage() {
  return (
    <>
      <p>
        <Link href="/">Back to components</Link>
      </p>
      <h1>Register component</h1>
      <ComponentForm action={createComponentAction} submitLabel="Register" />
    </>
  )
}
