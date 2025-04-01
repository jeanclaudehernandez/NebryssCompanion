import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'weaponRange',
  standalone: true
})
export class WeaponRangePipe implements PipeTransform {

  transform(range: number | null): unknown {
    return range == 0 ? 'melee' : range ?? '-';
  }

}
