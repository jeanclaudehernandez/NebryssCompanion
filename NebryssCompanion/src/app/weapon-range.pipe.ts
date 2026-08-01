import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'weaponRange',
  standalone: true
})
export class WeaponRangePipe implements PipeTransform {

  transform(range: number | null): string {
    return range === 0 ? '⚔️' : (range ? range + '"' : '-');
  }

}
