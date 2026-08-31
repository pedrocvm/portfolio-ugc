import { redirect } from 'next/navigation';

/** A biblioteca mudou para /dashboard/site/library. O endereço antigo fica a
 *  redirecionar: um marcador salvo não deve partir por causa de uma
 *  reorganização de menu. */
export default function MovedLibrary() {
  redirect('/dashboard/site/library');
}
