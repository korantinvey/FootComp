import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCurrentPlayer } from '@/data/hooks';
import { repo } from '@/data/store';
import { act } from '@/ui/act';
import { Button, Field, Muted, Screen } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function NewGroup() {
  const me = useCurrentPlayer();
  const [name, setName] = useState('');

  const create = async () => {
    if (!me || !name.trim()) return;
    const id = await act(() => repo.createGroup(name));
    if (!id) return;
    router.dismiss();
    router.push({ pathname: '/group/[groupId]', params: { groupId: id } });
  };

  return (
    <Screen>
      <View style={{ gap: space(4) }}>
        <Field
          label="Nom du groupe"
          placeholder="Ex. Five du mardi, FC Les Lilas…"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={create}
        />
        <Muted>Tu seras admin du groupe. Tu pourras ensuite ajouter des joueurs et nommer d&apos;autres admins.</Muted>
        <Button label="Créer le groupe" disabled={!name.trim()} onPress={create} />
      </View>
    </Screen>
  );
}
